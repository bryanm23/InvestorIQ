# Failover System Implementation Guide

This document outlines the implementation steps for setting up a robust failover system for our real estate SaaS application using Ansible and RabbitMQ integration.

## Architecture Overview

Our failover system uses the following architecture:

- **Health Check Service**: Runs on all VMs to report their status
- **Monitoring Service**: Runs on both RabbitMQ VM (primary) and Frontend VM (backup)
- **Ansible Worker**: Runs on both RabbitMQ VM and Frontend VM
- **Ansible Playbooks**: Stored on both RabbitMQ VM and Frontend VM

This architecture ensures that if any VM fails, including the RabbitMQ VM itself, the system can automatically detect the failure and activate the appropriate backup service.

## Implementation Steps

### 0. Pre install services

---
# File: /opt/ansible/pre_install_services.yml

- name: Pre-install services and dependencies
  hosts: all  # Run on all VMs
  become: yes
  tasks:
    # Common system packages
    - name: Update apt cache
      apt:
        update_cache: yes
        cache_valid_time: 3600

    - name: Install common packages
      apt:
        name:
          - python3
          - python3-pip
          - python3-dev
          - build-essential
          - git
          - curl
          - wget
          - unzip
          - net-tools
          - iputils-ping
          - vim
          - htop
          - ntp
          - ufw
        state: present

    # Python packages
    - name: Install common Python packages
      pip:
        name:
          - pika
          - requests
          - redis
          - flask
        state: present

    # Create common directories
    - name: Create monitoring directory
      file:
        path: /opt/monitoring
        state: directory
        mode: '0755'

    # Set up firewall rules
    # - name: Configure UFW
    #  ufw:
    #    rule: allow
    #    port: "{{ item }}"
    #    proto: tcp
    #  loop:
    #    - 22    # SSH
    #    - 80    # HTTP
    #    - 443   # HTTPS
    #    - 8080  # Monitor API
    #    - 5672  # RabbitMQ
    #    - 15672 # RabbitMQ Management
    #    - 3306  # MySQL
    #    - 6379  # Redis

    # Set up specific VM roles
    - name: Install frontend-specific packages
      apt:
        name:
          - nginx
          - nodejs
          - npm
        state: present
      when: "'frontend' in group_names"

    - name: Install backend-specific packages
      apt:
        name:
          - nodejs
          - npm
          - php
          - php-fpm
          - php-mysql
          - php-amqp
        state: present
      when: "'backend' in group_names"

    - name: Install messaging-specific packages
      apt:
        name:
          - rabbitmq-server
        state: present
      when: "'messaging' in group_names"

    - name: Install database-specific packages
      apt:
        name:
          - mysql-server
          - mysql-client
          - python3-mysqldb
        state: present
      when: "'database' in group_names"

    # Configure SSH for Ansible
    - name: Ensure .ssh directory exists
      file:
        path: ~/.ssh
        state: directory
        mode: '0700'

    - name: Generate SSH key if it doesn't exist
      command: ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
      args:
        creates: ~/.ssh/id_rsa

    # Set up NTP for time synchronization
    - name: Ensure NTP is running
      service:
        name: ntp
        state: started
        enabled: yes

    # Set system limits for RabbitMQ and MySQL
    - name: Set system limits for services
      pam_limits:
        domain: '*'
        limit_type: "{{ item.limit_type }}"
        limit_item: "{{ item.limit_item }}"
        value: "{{ item.value }}"
      loop:
        - { limit_type: soft, limit_item: nofile, value: 65536 }
        - { limit_type: hard, limit_item: nofile, value: 65536 }
        - { limit_type: soft, limit_item: nproc, value: 65536 }
        - { limit_type: hard, limit_item: nproc, value: 65536 }

### 1. Health Check Service (All VMs)

Deploy this service on all VMs to send heartbeats to RabbitMQ:

1. Create the monitoring directory:
   ```bash
   sudo mkdir -p /opt/monitoring
   ```

2. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-pip
   sudo pip3 install pika requests
   ```

3. Create the health check script at `/opt/monitoring/health_check.py`:
   ```python
   #!/usr/bin/env python3
   import pika
   import socket
   import time
   import os
   import subprocess
   import json

   # Configuration
   PRIMARY_RABBITMQ_HOST = "10.0.0.21"  # Primary RabbitMQ server IP
   BACKUP_RABBITMQ_HOST = "10.0.8.49"   # Frontend VM IP (backup RabbitMQ)
   RABBITMQ_PORT = 5672
   RABBITMQ_USER = "admin"
   RABBITMQ_PASS = "admin"
   EXCHANGE_NAME = "monitoring"
   ROUTING_KEY = "heartbeat"
   INSTANCE_ID = socket.gethostname()

   # Determine instance type based on hostname or IP
   if "frontend" in INSTANCE_ID or socket.gethostbyname(socket.gethostname()) == "10.0.8.49":
       INSTANCE_TYPE = "frontend"
   elif "backend" in INSTANCE_ID or socket.gethostbyname(socket.gethostname()) == "10.0.0.22":
       INSTANCE_TYPE = "backend"
   elif "messaging" in INSTANCE_ID or socket.gethostbyname(socket.gethostname()) == "10.0.0.21":
       INSTANCE_TYPE = "messaging"
   elif "database" in INSTANCE_ID or socket.gethostbyname(socket.gethostname()) == "10.0.10.169":
       INSTANCE_TYPE = "database"
   else:
       INSTANCE_TYPE = "unknown"

   def get_service_status():
       """Get the status of the primary service on this instance"""
       if INSTANCE_TYPE == "frontend":
           cmd = "systemctl is-active nginx"
       elif INSTANCE_TYPE == "backend":
           cmd = "systemctl is-active backend"
       elif INSTANCE_TYPE == "messaging":
           cmd = "systemctl is-active rabbitmq-server"
       elif INSTANCE_TYPE == "database":
           cmd = "systemctl is-active mysql"
       else:
           return "unknown"
       
       try:
           result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
           return result.stdout.strip()
       except Exception as e:
           return f"error: {str(e)}"

   def send_heartbeat():
       """Send heartbeat to RabbitMQ"""
       # Try primary RabbitMQ first, then fallback to backup
       rabbitmq_hosts = [PRIMARY_RABBITMQ_HOST, BACKUP_RABBITMQ_HOST]
       
       for host in rabbitmq_hosts:
           try:
               # Connect to RabbitMQ
               credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
               parameters = pika.ConnectionParameters(
                   host=host,
                   port=RABBITMQ_PORT,
                   credentials=credentials,
                   socket_timeout=3  # Short timeout to quickly try the next host
               )
               connection = pika.BlockingConnection(parameters)
               channel = connection.channel()
               
               # Ensure exchange exists
               channel.exchange_declare(
                   exchange=EXCHANGE_NAME,
                   exchange_type='direct',
                   durable=True
               )
               
               # Get service status
               status = get_service_status()
               
               # Prepare message
               message = {
                   "instance_id": INSTANCE_ID,
                   "instance_type": INSTANCE_TYPE,
                   "status": status,
                   "timestamp": time.time()
               }
               
               # Send message
               channel.basic_publish(
                   exchange=EXCHANGE_NAME,
                   routing_key=ROUTING_KEY,
                   body=json.dumps(message),
                   properties=pika.BasicProperties(
                       delivery_mode=2,  # Make message persistent
                   )
               )
               
               print(f"Sent heartbeat to {host}: {message}")
               connection.close()
               return  # Successfully sent, no need to try backup
               
           except Exception as e:
               print(f"Error sending heartbeat to {host}: {str(e)}")
               # Continue to try the next host
       
       print("Failed to send heartbeat to any RabbitMQ host")

   # Main loop
   if __name__ == "__main__":
       while True:
           send_heartbeat()
           time.sleep(30)  # Send heartbeat every 30 seconds
   ```

4. Make the script executable:
   ```bash
   sudo chmod +x /opt/monitoring/health_check.py
   ```

5. Create a systemd service at `/etc/systemd/system/health-check.service`:
   ```ini
   [Unit]
   Description=EC2 Instance Health Check Service
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   ExecStart=/usr/bin/python3 /opt/monitoring/health_check.py
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

6. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable health-check
   sudo systemctl start health-check
   ```

### 2. Monitoring Service (RabbitMQ VM and Frontend VM)

Deploy this service on both the RabbitMQ VM and Frontend VM:

1. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-pip redis-server
   sudo pip3 install pika requests redis flask
   ```

2. Create the monitoring service script at `/opt/monitoring/monitor.py`:
   ```python
   #!/usr/bin/env python3
   import pika
   import time
   import json
   import subprocess
   import logging
   import threading
   import socket
   import requests
   import redis
   from flask import Flask, request

   # Configure logging
   logging.basicConfig(
       level=logging.INFO,
       format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
       handlers=[
           logging.FileHandler("/var/log/failover-monitor.log"),
           logging.StreamHandler()
       ]
   )
   logger = logging.getLogger("FailoverMonitor")

   # Configuration
   PRIMARY_RABBITMQ_HOST = "10.0.0.21"  # Primary RabbitMQ server IP
   BACKUP_RABBITMQ_HOST = "10.0.8.49"   # Frontend VM IP (backup RabbitMQ)
   RABBITMQ_PORT = 5672
   RABBITMQ_USER = "admin"
   RABBITMQ_PASS = "admin"
   HEARTBEAT_QUEUE = "heartbeats"
   COMMAND_EXCHANGE = "commands"
   ANSIBLE_PATH = "/opt/ansible"
   REDIS_HOST = "localhost"
   REDIS_PORT = 6379
   MONITOR_PORT = 8080  # Port for the Flask app

   # Determine if this is the primary or backup monitor
   IS_PRIMARY = socket.gethostname() == "messaging-server" or socket.gethostbyname(socket.gethostname()) == "10.0.0.21"
   OTHER_MONITOR = BACKUP_RABBITMQ_HOST if IS_PRIMARY else PRIMARY_RABBITMQ_HOST

   # Track instance heartbeats
   instance_heartbeats = {}
   # Track failed instances to avoid repeated triggers
   failed_instances = set()
   # Active/passive state
   is_active = IS_PRIMARY  # Primary starts as active, backup as passive
   # Last heartbeat from primary monitor
   last_primary_heartbeat = time.time()

   # Flask app for heartbeat exchange between monitors
   app = Flask(__name__)

   @app.route('/monitor-heartbeat', methods=['GET'])
   def receive_monitor_heartbeat():
       monitor_id = request.args.get('monitor_id')
       logger.info(f"Received heartbeat from monitor: {monitor_id}")
       if monitor_id == "primary":
           global last_primary_heartbeat
           last_primary_heartbeat = time.time()
       return "OK"

   def send_monitor_heartbeat():
       """Send heartbeat to the other monitor"""
       try:
           monitor_id = "primary" if IS_PRIMARY else "backup"
           requests.get(f"http://{OTHER_MONITOR}:{MONITOR_PORT}/monitor-heartbeat", 
                       params={"monitor_id": monitor_id}, timeout=5)
       except Exception as e:
           logger.error(f"Failed to send heartbeat to other monitor: {str(e)}")

   def check_other_monitor():
       """Check if the other monitor is alive"""
       global is_active, last_primary_heartbeat
       
       if IS_PRIMARY:
           # Primary doesn't need to check the backup
           return
       
       # Backup checks if primary is alive
       try:
           # Try direct HTTP check
           response = requests.get(f"http://{PRIMARY_RABBITMQ_HOST}:{MONITOR_PORT}/health", timeout=5)
           if response.status_code == 200:
               logger.debug("Primary monitor is healthy via HTTP")
               return True
       except Exception:
           pass
       
       # Try checking RabbitMQ directly
       try:
           connection = pika.BlockingConnection(
               pika.ConnectionParameters(
                   host=PRIMARY_RABBITMQ_HOST,
                   port=RABBITMQ_PORT,
                   credentials=pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS),
                   socket_timeout=5
               )
           )
           connection.close()
           logger.debug("Primary RabbitMQ is healthy")
           return True
       except Exception:
           pass
       
       # If we reach here, primary appears to be down
       if not is_active:
           logger.warning("Primary monitor appears to be down. Initiating takeover.")
           initiate_takeover()
       
       return False

   def acquire_leader_lock():
       """Try to acquire the leader lock in Redis"""
       try:
           redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
           
           # Try to acquire lock with expiration
           acquired = redis_client.set(
               "monitor_leader_lock",
               socket.gethostname(),
               ex=30,  # 30 second expiration
               nx=True  # Only set if not exists
           )
           
           if acquired:
               # Schedule renewal of the lock
               threading.Timer(10, renew_leader_lock).start()
           
           return acquired
       except Exception as e:
           logger.error(f"Error acquiring leader lock: {str(e)}")
           return False

   def renew_leader_lock():
       """Renew the leader lock in Redis"""
       try:
           redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
           
           # Only renew if we still own the lock
           current_owner = redis_client.get("monitor_leader_lock")
           if current_owner and current_owner.decode() == socket.gethostname():
               redis_client.expire("monitor_leader_lock", 30)
               threading.Timer(10, renew_leader_lock).start()
       except Exception as e:
           logger.error(f"Error renewing leader lock: {str(e)}")

   def release_leader_lock():
       """Release the leader lock in Redis"""
       try:
           redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT)
           
           # Only release if we own the lock
           current_owner = redis_client.get("monitor_leader_lock")
           if current_owner and current_owner.decode() == socket.gethostname():
               redis_client.delete("monitor_leader_lock")
       except Exception as e:
           logger.error(f"Error releasing leader lock: {str(e)}")

   def initiate_takeover():
       """Initiate takeover as the active monitoring service"""
       global is_active
       
       logger.info("Initiating takeover as primary monitoring service")
       
       # Try to acquire the leader lock
       if not acquire_leader_lock():
           logger.info("Another monitor has already taken over")
           return
       
       # Activate RabbitMQ backup if needed
       if socket.gethostname() != "messaging-server":
           try:
               # Execute Ansible playbook to activate RabbitMQ backup
               subprocess.run([
                   "ansible-playbook",
                   f"{ANSIBLE_PATH}/activate_messaging.yml",
                   "-e", "failed_instance=messaging-server"
               ], check=True)
               
               logger.info("Activated RabbitMQ backup")
           except Exception as e:
               logger.error(f"Failed to activate RabbitMQ backup: {str(e)}")
               release_leader_lock()
               return
       
       # Update state to active
       is_active = True
       
       # Start consuming from heartbeat queue
       start_heartbeat_monitoring()
       
       logger.info("Successfully took over as primary monitoring service")

   def check_missing_heartbeats():
       """Check for missing heartbeats and trigger failover if needed"""
       if not is_active:
           return  # Only the active monitor should check heartbeats
           
       current_time = time.time()
       for instance_id, data in list(instance_heartbeats.items()):
           # If no heartbeat for 2 minutes (4 missed heartbeats), trigger failover
           if current_time - data["timestamp"] > 120:
               instance_type = data["instance_type"]
               if instance_id not in failed_instances:
                   logger.warning(f"Instance {instance_id} ({instance_type}) has missed heartbeats. Triggering failover.")
                   trigger_failover(instance_id, instance_type)
                   failed_instances.add(instance_id)
               # Remove from tracking to avoid repeated checks
               del instance_heartbeats[instance_id]

   def trigger_failover(instance_id, instance_type):
       """Trigger failover for a failed instance"""
       if not is_active:
           return  # Only the active monitor should trigger failover
           
       try:
           # Determine which RabbitMQ to use
           rabbitmq_host = BACKUP_RABBITMQ_HOST if socket.gethostname() == "frontend-server" else PRIMARY_RABBITMQ_HOST
           
           # Send failover command to RabbitMQ
           credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
           parameters = pika.ConnectionParameters(
               host=rabbitmq_host,
               port=RABBITMQ_PORT,
               credentials=credentials
           )
           connection = pika.BlockingConnection(parameters)
           channel = connection.channel()
           
           # Ensure exchange exists
           channel.exchange_declare(
               exchange=COMMAND_EXCHANGE,
               exchange_type='topic',
               durable=True
           )
           
           # Prepare message
           message = {
               "failed_instance": instance_id,
               "instance_type": instance_type,
               "timestamp": time.time()
           }
           
           # Send message
           routing_key = f"failover.{instance_type}"
           channel.basic_publish(
               exchange=COMMAND_EXCHANGE,
               routing_key=routing_key,
               body=json.dumps(message),
               properties=pika.BasicProperties(
                   delivery_mode=2,  # Make message persistent
               )
           )
           
           logger.info(f"Sent failover command: {message}")
           connection.close()
           
           # Also directly execute Ansible playbook for immediate action
           execute_ansible_playbook(instance_type, instance_id)
           
       except Exception as e:
           logger.error(f"Error triggering failover: {str(e)}")

   def execute_ansible_playbook(instance_type, instance_id):
       """Execute Ansible playbook for failover"""
       if not is_active:
           return  # Only the active monitor should execute playbooks
           
       try:
           playbook = f"{ANSIBLE_PATH}/activate_{instance_type}.yml"
           cmd = [
               "ansible-playbook",
               playbook,
               "-e", f"failed_instance={instance_id}"
           ]
           
           logger.info(f"Executing Ansible playbook: {' '.join(cmd)}")
           result = subprocess.run(cmd, capture_output=True, text=True)
           
           if result.returncode == 0:
               logger.info(f"Ansible playbook executed successfully: {result.stdout}")
           else:
               logger.error(f"Ansible playbook failed: {result.stderr}")
               
       except Exception as e:
           logger.error(f"Error executing Ansible playbook: {str(e)}")

   def process_heartbeat(ch, method, properties, body):
       """Process heartbeat message from RabbitMQ"""
       try:
           message = json.loads(body)
           instance_id = message["instance_id"]
           instance_type = message["instance_type"]
           status = message["status"]
           timestamp = message["timestamp"]
           
           # Update heartbeat tracking
           instance_heartbeats[instance_id] = {
               "instance_type": instance_type,
               "status": status,
               "timestamp": timestamp
           }
           
           # If instance was previously failed but is now back, remove from failed list
           if instance_id in failed_instances and status == "active":
               logger.info(f"Instance {instance_id} ({instance_type}) has recovered.")
               failed_instances.remove(instance_id)
           
           # Acknowledge message
           ch.basic_ack(delivery_tag=method.delivery_tag)
           
       except Exception as e:
           logger.error(f"Error processing heartbeat: {str(e)}")
           # Reject message
           ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

   def start_heartbeat_monitoring():
       """Start consuming heartbeats from RabbitMQ"""
       if not is_active:
           return  # Only the active monitor should consume heartbeats
       
       try:
           # Determine which RabbitMQ to use
           rabbitmq_host = BACKUP_RABBITMQ_HOST if socket.gethostname() == "frontend-server" else PRIMARY_RABBITMQ_HOST
           
           # Connect to RabbitMQ
           credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
           parameters = pika.ConnectionParameters(
               host=rabbitmq_host,
               port=RABBITMQ_PORT,
               credentials=credentials
           )
           connection = pika.BlockingConnection(parameters)
           channel = connection.channel()
           
           # Ensure queue exists
           channel.queue_declare(queue=HEARTBEAT_QUEUE, durable=True)
           
           # Set up consumer
           channel.basic_consume(
               queue=HEARTBEAT_QUEUE,
               on_message_callback=process_heartbeat
           )
           
           logger.info(f"Starting heartbeat monitoring on {rabbitmq_host}. Waiting for messages...")
           
           # Start consuming in a separate thread
           def consume_messages():
               channel.start_consuming()
               
           consumer_thread = threading.Thread(target=consume_messages)
           consumer_thread.daemon = True
           consumer_thread.start()
           
       except Exception as e:
           logger.error(f"Error starting heartbeat monitoring: {str(e)}")

   @app.route('/health', methods=['GET'])
   def health_check():
       """Health check endpoint"""
       return "OK"

   def startup_procedure():
       """Procedure to run at startup"""
       global is_active
       
       # If this is the primary monitor, try to become active
       if IS_PRIMARY:
           if acquire_leader_lock():
               logger.info("Starting as active monitoring service")
               is_active = True
               start_heartbeat_monitoring()
           else:
               logger.info("Could not acquire leader lock. Starting in passive mode.")
               is_active = False
       else:
           # This is the backup monitor, check if primary is alive
           if check_other_monitor():
               logger.info("Primary monitor is alive. Starting in passive mode.")
               is_active = False
           else:
               logger.info("Primary monitor appears to be down. Attempting to take over.")
               initiate_takeover()

   def main():
       """Main function"""
       # Start the Flask app in a separate thread
       flask_thread = threading.Thread(target=lambda: app.run(host='0.0.0.0', port=MONITOR_PORT))
       flask_thread.daemon = True
       flask_thread.start()
       
       # Run startup procedure
       startup_procedure()
       
       # Start monitor heartbeat exchange
       def send_heartbeats_periodically():
           while True:
               send_monitor_heartbeat()
               time.sleep(15)  # Send every 15 seconds
               
       heartbeat_thread = threading.Thread(target=send_heartbeats_periodically)
       heartbeat_thread.daemon = True
       heartbeat_thread.start()
       
       # Start checking the other monitor
       def check_other_monitor_periodically():
           while True:
               check_other_monitor()
               time.sleep(30)  # Check every 30 seconds
               
       check_thread = threading.Thread(target=check_other_monitor_periodically)
       check_thread.daemon = True
       check_thread.start()
       
       # Start checking for missing heartbeats
       def check_heartbeats_periodically():
           while True:
               if is_active:
                   check_missing_heartbeats()
               time.sleep(30)  # Check every 30 seconds
               
       missing_thread = threading.Thread(target=check_heartbeats_periodically)
       missing_thread.daemon = True
       missing_thread.start()
       
       # Keep the main thread alive
       try:
           while True:
               time.sleep(1)
       except KeyboardInterrupt:
           logger.info("Shutting down...")
           if is_active:
               release_leader_lock()

   if __name__ == "__main__":
       main()
   ```

3. Make the script executable:
   ```bash
   sudo chmod +x /opt/monitoring/monitor.py
   ```

4. Create a systemd service at `/etc/systemd/system/failover-monitor.service`:
   ```ini
   [Unit]
   Description=EC2 Failover Monitoring Service
   After=network.target redis-server.service

   [Service]
   Type=simple
   User=ubuntu
   ExecStart=/usr/bin/python3 /opt/monitoring/monitor.py
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

5. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable failover-monitor
   sudo systemctl start failover-monitor
   ```

### 3. Ansible Worker Service (RabbitMQ VM and Frontend VM)

Deploy the Ansible worker on both VMs:

1. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-pip ansible
   sudo pip3 install pika
   ```

2. Create the Ansible worker script at `/opt/monitoring/ansible_worker.py`:
   ```python
   #!/usr/bin/env python3
   import pika
   import json
   import subprocess
   import logging
   import os
   import socket

   # Configure logging
   logging.basicConfig(
       level=logging.INFO,
       format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
       handlers=[
           logging.FileHandler("/var/log/ansible-worker.log"),
           logging.StreamHandler()
       ]
   )
   logger = logging.getLogger("AnsibleWorker")

   # Configuration
   PRIMARY_RABBITMQ_HOST = "10.0.0.21"  # Primary RabbitMQ server IP
   BACKUP_RABBITMQ_HOST = "10.0.8.49"   # Frontend VM IP (backup RabbitMQ)
   RABBITMQ_PORT = 5672
   RABBITMQ_USER = "admin"
   RABBITMQ_PASS = "admin"
   COMMAND_QUEUE = "failover_commands"
   ANSIBLE_PATH = "/opt/ansible"

   def execute_ansible_playbook(instance_type, instance_id):
       """Execute Ansible playbook for failover"""
       try:
           playbook = f"{ANSIBLE_PATH}/activate_{instance_type}.yml"
           if not os.path.exists(playbook):
               logger.error(f"Playbook not found: {playbook}")
               return
               
           cmd = [
               "ansible-playbook",
               playbook,
               "-e", f"failed_instance={instance_id}"
           ]
           
           logger.info(f"Executing Ansible playbook: {' '.join(cmd)}")
           result = subprocess.run(cmd, capture_output=True, text=True)
           
           if result.returncode == 0:
               logger.info(f"Ansible playbook executed successfully: {result.stdout}")
           else:
               logger.error(f"Ansible playbook failed: {result.stderr}")
               
       except Exception as e:
           logger.error(f"Error executing Ansible playbook: {str(e)}")

   def process_command(ch, method, properties, body):
       """Process failover command from RabbitMQ"""
       try:
           message = json.loads(body)
           instance_id = message["failed_instance"]
           instance_type = message["instance_type"]
           
           logger.info(f"Received failover command for {instance_type} instance {instance_id}")
           
           # Execute Ansible playbook
           execute_ansible_playbook(instance_type, instance_id)
           
           # Acknowledge message
           ch.basic_ack(delivery_tag=method.delivery_tag)
           
       except Exception as e:
           logger.error(f"Error processing command: {str(e)}")
           # Reject message
           ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

   def connect_to_rabbitmq():
       """Connect to RabbitMQ with fallback"""
       # Try primary RabbitMQ first, then fallback to backup
       rabbitmq_hosts = [PRIMARY_RABBITMQ_HOST, BACKUP_RABBITMQ_HOST]
       
       # If this is the frontend server, try the backup (local) RabbitMQ first
       if socket.gethostname() == "frontend-server":
           rabbitmq_hosts.reverse()
       
       for host in rabbitmq_hosts:
           try:
               logger.info(f"Attempting to connect to RabbitMQ at {host}")
               credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
               parameters = pika.ConnectionParameters(
                   host=host,
                   port=RABBITMQ_PORT,
                   credentials=credentials,
                   socket_timeout=5
               )
               connection = pika.BlockingConnection(parameters)
               channel = connection.channel()
               
               # Ensure queue exists
               channel.queue_declare(queue=COMMAND_QUEUE, durable=True)
               
               logger.info(f"Successfully connected to RabbitMQ at {host}")
               return connection, channel
               
           except Exception as e:
               logger.error(f"Error connecting to RabbitMQ at {host}: {str(e)}")
       
       logger.error("Failed to connect to any RabbitMQ host")
       return None, None

   def main():
       """Main function to start worker"""
       try:
           connection, channel = connect_to_rabbitmq()
           if not connection or not channel:
               logger.error("Could not connect to RabbitMQ. Exiting.")
               return
           
           # Set up consumer
           channel.basic_consume(
               queue=COMMAND_QUEUE,
               on_message_callback=process_command
           )
           
           logger.info("Starting Ansible worker. Waiting for commands...")
           
           # Start consuming messages
           channel.start_consuming()
           
       except Exception as e:
           logger.error(f"Error in main function: {str(e)}")
           if 'connection' in locals() and connection and connection.is_open:
               connection.close()

   if __name__ == "__main__":
       main()
   ```

3. Make the script executable:
   ```bash
   sudo chmod +x /opt/monitoring/ansible_worker.py
   ```

4. Create a systemd service at `/etc/systemd/system/ansible-worker.service`:
   ```ini
   [Unit]
   Description=Ansible Worker Service
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   ExecStart=/usr/bin/python3 /opt/monitoring/ansible_worker.py
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

5. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable ansible-worker
   sudo systemctl start ansible-worker
   ```

### 4. Ansible Playbooks (RabbitMQ VM and Frontend VM)

Set up identical Ansible playbooks on both VMs:

1. Create the Ansible project structure:
   ```bash
   sudo mkdir -p /opt/ansible/{inventory,roles,group_vars}
   ```

2. Create the inventory file at `/opt/ansible/inventory/hosts`:
   ```ini
   [frontend]
   frontend-server ansible_host=10.0.8.49

   [backend]
   backend-server ansible_host=10.0.0.22

   [messaging]
   messaging-server ansible_host=10.0.0.21

   [database]
   database-server ansible_host=10.0.10.169

   [frontend_backups]
   backend-server
   messaging-server

   [backend_backups]
   frontend-server
   database-server

   [messaging_backups]
   frontend-server
   database-server

   [database_backups]
   backend-server
   messaging-server
   ```

3. Create the Ansible configuration file at `/opt/ansible/ansible.cfg`:
   ```ini
   [defaults]
   inventory = inventory/hosts
   host_key_checking = False
   roles_path = ./roles
   ```

4. Create the database failover playbook at `/opt/ansible/activate_database.yml`:
   ```yaml
   ---
   - name: Activate Database Backup
     hosts: database_backups
     become: yes
     vars:
       failed_instance: "{{ failed_instance }}"
       
     tasks:
       - name: Check if this host should activate
         set_fact:
           activate_backup: "{{ inventory_hostname != failed_instance }}"
         
       - name: Start MySQL service
         service:
           name: mysql
           state: started
           enabled: yes
         when: activate_backup
         
       - name: Get replication status
         mysql_replication:
           mode: getprimary
           login_user: root
           login_password: admin
         register: repl_status
         when: activate_backup
         
       - name: Stop MySQL slave
         mysql_replication:
           mode: stopslave
           login_user: root
           login_password: admin
         when: activate_backup and repl_status.Is_Slave is defined and repl_status.Is_Slave
         
       - name: Promote to master
         mysql_replication:
           mode: resetprimary
           login_user: root
           login_password: admin
         when: activate_backup and repl_status.Is_Slave is defined and repl_status.Is_Slave
         
       - name: Update MySQL configuration
         template:
           src: my.cnf.j2
           dest: /etc/mysql/my.cnf
         vars:
           is_backup_node: false
         when: activate_backup
         
       - name: Restart MySQL service
         service:
           name: mysql
           state: restarted
         when: activate_backup
         
       - name: Configure virtual IP
         command: ip addr add 10.0.10.200/24 dev eth0
         ignore_errors: yes
         when: activate_backup
         
       - name: Update Route 53 DNS record
         route53:
           state: present
           zone: "yourdomain.com"
           record: "db.yourdomain.com"
           type: A
           ttl: 60
           value: "{{ ansible_default_ipv4.address }}"
           overwrite: yes
         when: activate_backup
   ```

5. Create the RabbitMQ failover playbook at `/opt/ansible/activate_messaging.yml`:
   ```yaml
   ---
   - name: Activate RabbitMQ Backup
     hosts: messaging_backups
     become: yes
     vars:
       failed_instance: "{{ failed_instance }}"
       
     tasks:
       - name: Check if this host should activate
         set_fact:
           activate_backup: "{{ inventory_hostname != failed_instance }}"
         
       - name: Update RabbitMQ configuration
         template:
           src: rabbitmq.conf.j2
           dest: /etc/rabbitmq/rabbitmq.conf
         vars:
           is_backup_node: false
         when: activate_backup
         
       - name: Start RabbitMQ service
         service:
           name: rabbitmq-server
           state: started
           enabled: yes
         when: activate_backup
         
       - name: Wait for RabbitMQ to start
         wait_for:
           port: 5672
           delay: 10
           timeout: 60
         when: activate_backup
         
       - name: Configure virtual IP
         command: ip addr add 10.0.0.200/24 dev eth0
         ignore_errors: yes
         when: activate_backup
         
       - name: Update Route 53 DNS record
         route53:
           state: present
           zone: "yourdomain.com"
           record: "rabbitmq.yourdomain.com"
           type: A
           ttl: 60
           value: "{{ ansible_default_ipv4.address }}"
           overwrite: yes
         when: activate_backup
   ```

6. Create the Frontend failover playbook at `/opt/ansible/activate_frontend.yml`:
   ```yaml
   ---
   - name: Activate Frontend Backup
     hosts: frontend_backups
     become: yes
     vars:
       failed_instance: "{{ failed_instance }}"
       
     tasks:
       - name: Check if this host should activate
         set_fact:
           activate_backup: "{{ inventory_hostname != failed_instance }}"
         
       - name: Update frontend environment variables
         template:
           src: env.j2
           dest: "/var/www/frontend/.env"
         vars:
           backend_host: "{{ hostvars['backend-server']['ansible_host'] }}"
         when: activate_backup
         
       - name: Enable Nginx site
         file:
           src: /etc/nginx/sites-available/frontend
           dest: /etc/nginx/sites-enabled/frontend
           state: link
         when: activate_backup
         
       - name: Start Nginx service
         service:
           name: nginx
           state: started
           enabled: yes
         when: activate_backup
         
       - name: Configure virtual IP
         command: ip addr add 10.0.8.200/24 dev eth0
         ignore_errors: yes
         when: activate_backup
         
       - name: Update Route 53 DNS record
         route53:
           state: present
           zone: "yourdomain.com"
           record: "app.yourdomain.com"
           type: A
           ttl: 60
           value: "{{ ansible_default_ipv4.address }}"
           overwrite: yes
         when: activate_backup
   ```

7. Create the Backend failover playbook at `/opt/ansible/activate_backend.yml`:
   ```yaml
   ---
   - name: Activate Backend Backup
     hosts: backend_backups
     become: yes
     vars:
       failed_instance: "{{ failed_instance }}"
       
     tasks:
       - name: Check if this host should activate
         set_fact:
           activate_backup: "{{ inventory_hostname != failed_instance }}"
         
       - name: Update backend environment variables
         template:
           src: backend.env.j2
           dest: "/var/www/backend/.env"
         vars:
           db_host: "{{ hostvars['database-server']['ansible_host'] }}"
           rabbitmq_host: "{{ hostvars['messaging-server']['ansible_host'] }}"
         when: activate_backup
         
       - name: Start Node.js backend service
         systemd:
           name: backend
           state: started
           enabled: yes
         when: activate_backup
         
       - name: Start PHP-FPM service
         service:
           name: php-fpm
           state: started
           enabled: yes
         when: activate_backup
         
       - name: Configure virtual IP
         command: ip addr add 10.0.0.210/24 dev eth0
         ignore_errors: yes
         when: activate_backup
         
       - name: Update Route 53 DNS record
         route53:
           state: present
           zone: "yourdomain.com"
           record: "api.yourdomain.com"
           type: A
           ttl: 60
           value: "{{ ansible_default_ipv4.address }}"
           overwrite: yes
         when: activate_backup
   ```

### 5. SSH Key Setup for Ansible

Ensure both the RabbitMQ VM and Frontend VM can SSH to all other VMs:

```bash
# On both RabbitMQ VM and Frontend VM
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""

# Copy the key to each VM (repeat for each VM)
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@10.0.8.49  # Frontend
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@10.0.0.22  # Backend
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@10.0.0.21  # Messaging
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@10.0.10.169  # Database
```

### 6. Synchronization Between Primary and Backup

To keep the Ansible playbooks synchronized between the RabbitMQ VM and Frontend VM:

```bash
# On the RabbitMQ VM (primary)
sudo tee /opt/ansible/sync-playbooks.sh > /dev/null << 'EOF'
#!/bin/bash
# Sync Ansible playbooks to backup VM
rsync -avz /opt/ansible/ ubuntu@10.0.8.49:/opt/ansible/
EOF

sudo chmod +x /opt/ansible/sync-playbooks.sh

# Create a cron job to sync every hour
(crontab -l 2>/dev/null; echo "0 * * * * /opt/ansible/sync-playbooks.sh") | crontab -
```

## Testing the Failover System

To test the failover system:

1. SSH into one of your primary instances
2. Stop the primary service (e.g., `sudo systemctl stop mysql` for the database server)
3. Monitor the logs:
   - `/var/log/failover-monitor.log` - To see if the failure is detected
   - `/var/log/ansible-worker.log` - To see if the Ansible playbook is executed
4. Check if the backup service is activated on the appropriate backup node

## Conclusion

This implementation provides a robust failover system that:

1. Continuously monitors the health of all VMs
2. Automatically detects failures
3. Activates backup services on other VMs
4. Handles the failure of the monitoring system itself

The architecture ensures high availability while efficiently using your existing 4 VMs without requiring additional resources.
