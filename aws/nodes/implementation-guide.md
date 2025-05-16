# Clustered Failover System Implementation Guide

This guide provides step-by-step instructions for setting up a robust clustered failover system for your real estate SaaS application across your 4 VMs. The implementation uses Python scripts, Ansible, and RabbitMQ integration to ensure high availability through a round-robin service activation approach.

## System Architecture

The clustered failover system architecture includes:

- **Health Check Service**: Runs on all VMs to report their status
- **Monitoring Service**: Runs on both RabbitMQ VM (primary) and Frontend VM (backup)
- **Ansible Worker**: Runs on both RabbitMQ VM and Frontend VM 
- **Ansible Playbooks**: Stored on both RabbitMQ VM and Frontend VM
- **Clustered Services**: Each service (Database, Messaging, Frontend, Backend) can run on multiple VMs in a clustered configuration

This architecture ensures high availability by:
1. Installing all necessary packages on all VMs
2. Allowing any service to be activated on any VM when needed
3. Supporting clustered configurations for critical services
4. Enabling round-robin service activation for load balancing

## Prerequisites

- 4 VMs with the following IP addresses:
  - Frontend VM: 10.0.8.49
  - Backend VM: 10.0.0.22
  - Messaging VM (RabbitMQ): 10.0.0.21
  - Database VM: 10.0.10.169
- Ubuntu operating system on all VMs
- Sudo privileges on all VMs

## Implementation Steps

### Step 1: Clone the Repository

On each VM, first clone the project repository:

```bash
mkdir -p ~/Capstone-Group-01
cd ~/Capstone-Group-01
git clone <your-repo-url> aws
cd aws
```

Alternatively, create the directory structure manually:

```bash
mkdir -p ~/Capstone-Group-01/aws/ansible/{playbooks,inventory,roles,templates}
mkdir -p ~/Capstone-Group-01/aws/services/{health,monitor,worker}
mkdir -p ~/Capstone-Group-01/aws/scripts
```

### Step 2: Copy Implementation Files

Copy all the implementation files to their respective locations. The file structure should be as follows:

```
~/Capstone-Group-01/aws/
├── ansible/
│   ├── ansible.cfg
│   ├── inventory/
│   │   └── hosts
│   ├── playbooks/
│   │   ├── activate_backend.yml
│   │   ├── activate_database.yml
│   │   ├── activate_frontend.yml
│   │   ├── activate_messaging.yml
│   │   └── pre_install_services.yml
│   └── templates/
│       ├── backend.env.j2
│       ├── env.j2
│       ├── my.cnf.j2
│       └── rabbitmq.conf.j2
├── services/
│   ├── health/
│   │   ├── health_check.py
│   │   └── health-check.service
│   ├── monitor/
│   │   ├── monitor.py
│   │   └── failover-monitor.service
│   └── worker/
│       ├── ansible_worker.py
│       └── ansible-worker.service
└── scripts/
    ├── setup.sh
    └── distribute_ssh_keys.sh
```

### Step 3: Run Pre-installation Playbook

On the messaging VM (or another VM with Ansible installed), run the pre-installation playbook to set up all dependencies:

```bash
# First, install Ansible if not already installed
sudo apt update
sudo apt install -y ansible

# Run the pre-installation playbook
cd ~/Capstone-Group-01/aws
sudo ansible-playbook -i ansible/inventory/hosts ansible/playbooks/pre_install_services.yml
```

This playbook will install all required dependencies on each VM based on their roles.

### Step 4: Distribute SSH Keys

To allow password-less SSH connections between VMs (required for Ansible), run the SSH key distribution script:

```bash
cd ~/Capstone-Group-01/aws/scripts
chmod +x setup_keys_backend.sh
chmod +x setup_keys_database.sh
chmod +x setup_keys_frontend.sh
chmod +x setup_keys_messaging.sh
./keys.sh
```

### Step 5: Run Setup Script

Run the setup script on each VM to install services, set up systemd units, and configure the cron job:

```bash
chmod +x /home/ubuntu/Capstone-Group-01/aws/services/monitor/monitor.py
chmod +x /home/ubuntu/Capstone-Group-01/aws/services/worker/ansible_worker.py
chmod +x /home/ubuntu/Capstone-Group-01/aws/services/health/health_check.py


sudo touch /var/log/failover-monitor.log /var/log/ansible-worker.log
sudo chown ubuntu:ubuntu /var/log/failover-monitor.log /var/log/ansible-worker.log
```

```bash
cd ~/Capstone-Group-01/aws/scripts
chmod +x setup.sh
./setup.sh
```

This script will:
1. Detect the VM type
2. Install the health check service on all VMs
3. Install monitoring and Ansible worker services on messaging and frontend VMs
4. Set up SSH keys and cron jobs for playbook synchronization

### Step 6: Verify Service Installation

On each VM, check that the services are running correctly:

```bash
# Check health check service (all VMs)
sudo systemctl status health-check

# On messaging and frontend VMs, also check:
sudo systemctl status failover-monitor
sudo systemctl status ansible-worker

# Check logs
sudo journalctl -u health-check
sudo journalctl -u failover-monitor
sudo journalctl -u ansible-worker
tail -f /var/log/failover-monitor.log
tail -f /var/log/ansible-worker.log
```

### Step 7: Test Failover System

To test if the failover system works correctly:

1. **Simulate a service failure**: Stop a primary service on one of the VMs
   ```bash
   # For example, to stop RabbitMQ on the messaging VM:
   sudo systemctl stop rabbitmq-server
   ```

2. **Monitor logs to see if failure is detected**:
   ```bash
   tail -f /var/log/failover-monitor.log
   ```

3. **Check if backup service is activated**:
   ```bash
   # On the backup VM for the failed service
   sudo systemctl status rabbitmq-server  # Or the relevant service
   ```

## Troubleshooting

If you encounter issues with the failover system:

1. **Check connectivity between VMs**:
   ```bash
   ping <vm-ip-address>
   ```

2. **Verify RabbitMQ is accepting connections**:
   ```bash
   telnet 10.0.0.21 5672  # Primary RabbitMQ
   telnet 10.0.8.49 5672  # Backup RabbitMQ
   ```

3. **Check if Redis is running** (required for leader election):
   ```bash
   sudo systemctl status redis-server
   ```

4. **Verify Ansible can connect to all hosts**:
   ```bash
   ansible -i ~/Capstone-Group-01/aws/ansible/inventory/hosts all -m ping
   ```

5. **Manually run health check**:
   ```bash
   python3 ~/Capstone-Group-01/aws/services/health/health_check.py
   ```

## Clustered Architecture Setup

The clustered architecture allows each service to run on multiple VMs, providing high availability and load balancing. This section explains how to set up and configure the clustered services.


## Maintenance

### Playbook Synchronization

The messaging VM will automatically sync Ansible playbooks to the frontend VM every hour. To manually trigger the sync:

```bash
~/Capstone-Group-01/aws/ansible/sync-playbooks.sh
```

### Adding or Replacing VMs

If you need to add or replace a VM:

1. Update the inventory file: `~/Capstone-Group-01/aws/ansible/inventory/hosts`
2. Run the pre-installation playbook for the new VM
3. Distribute SSH keys to the new VM
4. Run the setup script on the new VM
5. Join the appropriate clusters (MySQL, RabbitMQ) if applicable

### Updating Configuration

To update the configuration of any component:

1. Modify the templates in `~/Capstone-Group-01/aws/ansible/templates/`
2. Re-run the appropriate Ansible playbook
   ```bash
   ansible-playbook -i ~/Capstone-Group-01/aws/ansible/inventory/hosts ~/Capstone-Group-01/aws/ansible/playbooks/pre_install_services.yml
   ```

## Security Considerations

- The implementation currently uses a fixed admin/admin username and password for RabbitMQ. In production, use more secure credentials.
- Consider implementing SSL/TLS for RabbitMQ connections.
- Use a more secure method for SSH key distribution in production environments.
- Implement firewall rules to restrict access to critical ports.

## Round-Robin Service Activation

The round-robin service activation approach allows services to be dynamically activated on different VMs based on load and availability. This section explains how to implement this approach.

### Monitoring Service Enhancement

Enhance the monitoring service to support round-robin activation:

1. **Update the Monitor Configuration**:

   Create a configuration file for the monitor service:
   ```bash
   sudo nano /opt/monitoring/config.json
   ```
   
   Add the following configuration:
   ```json
   {
     "services": {
       "mysql": {
         "primary_vm": "10.0.10.169",
         "secondary_vms": ["10.0.0.22"],
         "check_command": "systemctl is-active mysql",
         "activate_command": "ansible-playbook -i /home/ubuntu/Capstone-Group-01/aws/ansible/inventory/hosts /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_database.yml"
       },
       "rabbitmq": {
         "primary_vm": "10.0.0.21",
         "secondary_vms": ["10.0.8.49"],
         "check_command": "systemctl is-active rabbitmq-server",
         "activate_command": "ansible-playbook -i /home/ubuntu/Capstone-Group-01/aws/ansible/inventory/hosts /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_messaging.yml"
       },
       "frontend": {
         "primary_vm": "10.0.8.49",
         "secondary_vms": ["10.0.0.22"],
         "check_command": "systemctl is-active nginx",
         "activate_command": "ansible-playbook -i /home/ubuntu/Capstone-Group-01/aws/ansible/inventory/hosts /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_frontend.yml"
       },
       "backend": {
         "primary_vm": "10.0.0.22",
         "secondary_vms": ["10.0.0.21"],
         "check_command": "systemctl is-active node-app",
         "activate_command": "ansible-playbook -i /home/ubuntu/Capstone-Group-01/aws/ansible/inventory/hosts /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_backend.yml"
       }
     },
     "round_robin": {
       "enabled": true,
       "interval_hours": 24,
       "exclude_services": []
     }
   }
   ```

2. **Update the Monitor Service**:

   Modify the monitor service to read this configuration and implement round-robin activation:
   ```bash
   sudo nano /home/ubuntu/Capstone-Group-01/aws/services/monitor/monitor.py
   ```
   
   Add logic to:
   - Read the configuration file
   - Check service health on all VMs
   - Activate services on secondary VMs in a round-robin fashion
   - Handle failover when a service fails

### Activation Playbooks Enhancement

Update the activation playbooks to support clustered service activation:

1. **Update Database Activation Playbook**:
   ```bash
   sudo nano /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_database.yml
   ```
   
   Add tasks to:
   - Start MySQL service
   - Configure replication if needed
   - Update load balancer configuration

2. **Update RabbitMQ Activation Playbook**:
   ```bash
   sudo nano /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_messaging.yml
   ```
   
   Add tasks to:
   - Start RabbitMQ service
   - Join the cluster if needed
   - Configure mirrored queues

3. **Update Frontend/Backend Activation Playbooks**:
   ```bash
   sudo nano /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_frontend.yml
   sudo nano /home/ubuntu/Capstone-Group-01/aws/ansible/playbooks/activate_backend.yml
   ```
   
   Add tasks to:
   - Start the appropriate services
   - Update load balancer configuration

### Testing Round-Robin Activation

To test the round-robin service activation:

1. **Manually Trigger Round-Robin**:
   ```bash
   sudo python3 /home/ubuntu/Capstone-Group-01/aws/services/monitor/trigger_round_robin.py
   ```

2. **Monitor Service Activation**:
   ```bash
   tail -f /var/log/failover-monitor.log
   ```

3. **Verify Services on Secondary VMs**:
   ```bash
   # Check if services are running on secondary VMs
   ssh ubuntu@10.0.0.22 "sudo systemctl status mysql"
   ssh ubuntu@10.0.8.49 "sudo systemctl status rabbitmq-server"
   ```

## Conclusion

This implementation provides a robust clustered failover system that:

1. Continuously monitors the health of all VMs
2. Automatically detects failures
3. Activates backup services on other VMs
4. Handles the failure of the monitoring system itself
5. Supports clustered configurations for critical services
6. Enables round-robin service activation for load balancing

The architecture ensures high availability while efficiently using your existing 4 VMs without requiring additional resources. By installing all necessary packages on all VMs and implementing a round-robin activation approach, you can achieve a highly available system that can withstand multiple failures.

## Automatic Failback Implementation

The failover system has been enhanced with automatic failback functionality. When a primary service is restarted on its original VM, the system will automatically detect this and stop the backup instances of that service on other VMs. This prevents duplicate services from running simultaneously and ensures a clean transition back to the primary configuration.

### Failback Components

The automatic failback implementation consists of the following components:

1. **Deactivation Playbooks**: New Ansible playbooks that stop services on backup VMs when the primary service recovers:
   - `deactivate_messaging.yml`: Stops RabbitMQ on backup VMs
   - `deactivate_database.yml`: Stops MySQL on backup VMs
   - `deactivate_frontend.yml`: Stops the frontend service and Nginx on backup VMs
   - `deactivate_backend.yml`: Stops the Node.js backend service on backup VMs

2. **Enhanced Ansible Worker**: The `ansible_worker.py` script has been updated to handle both failover and failback commands.

3. **Enhanced Monitoring Service**: The `monitor.py` script has been updated to detect when a primary service recovers and trigger the failback process.

### Testing Failback Functionality

To test the automatic failback functionality:

1. **Simulate a Service Failure and Failover**:
   ```bash
   # On the messaging VM (10.0.0.21):
   sudo systemctl stop rabbitmq-server
   ```

2. **Monitor Logs to Confirm Failover**:
   ```bash
   # On the monitoring VM (either messaging or frontend):
   tail -f /var/log/failover-monitor.log
   ```

3. **Verify Backup Service Activation**:
   ```bash
   # On the frontend VM (10.0.8.49):
   sudo systemctl status rabbitmq-server
   ```

4. **Restart the Primary Service**:
   ```bash
   # On the messaging VM (10.0.0.21):
   sudo systemctl start rabbitmq-server
   ```

5. **Monitor Logs to Confirm Failback Detection**:
   ```bash
   # On the monitoring VM:
   tail -f /var/log/failover-monitor.log
   ```
   
   You should see messages indicating:
   - The primary service has recovered
   - A 60-second grace period has started
   - The failback process has been triggered

6. **Verify Backup Service Deactivation**:
   ```bash
   # On the frontend VM (10.0.8.49):
   sudo systemctl status rabbitmq-server
   ```
   
   After the failback process completes, the backup service should be stopped.

### Troubleshooting Failback

If the failback process doesn't work as expected:

1. **Check Deactivation Playbooks**:
   ```bash
   # Manually run a deactivation playbook
   ansible-playbook -i ~/Capstone-Group-01/aws/ansible/inventory/hosts ~/Capstone-Group-01/aws/ansible/playbooks/deactivate_messaging.yml -e "recovered_instance=messaging-server"
   ```

2. **Check Ansible Worker Logs**:
   ```bash
   tail -f /var/log/ansible-worker.log
   ```

3. **Verify RabbitMQ Queue**:
   ```bash
   # On a VM with RabbitMQ:
   sudo rabbitmqctl list_queues
   ```
   
   Check if the "failover_commands" queue exists and has messages.

4. **Manually Trigger Failback**:
   ```bash
   # On the monitoring VM:
   python3 -c "
   import json
   import pika
   
   credentials = pika.PlainCredentials('admin', 'admin')
   connection = pika.BlockingConnection(pika.ConnectionParameters('localhost', 5672, '/', credentials))
   channel = connection.channel()
   
   message = {
       'command_type': 'failback',
       'recovered_instance': 'messaging-server',
       'instance_type': 'messaging',
       'timestamp': 1617567890.123
   }
   
   channel.queue_declare(queue='failover_commands', durable=True)
   channel.basic_publish(
       exchange='',
       routing_key='failover_commands',
       body=json.dumps(message),
       properties=pika.BasicProperties(delivery_mode=2)
   )
   
   print('Sent failback command')
   connection.close()
   "
   ```
