### Database Cluster Setup

To set up a MySQL cluster across multiple VMs:

1. **Configure MySQL Replication**:
   
   On the primary database VM (initially 10.0.10.169):
   ```bash
   sudo mysql -e "CREATE USER 'replication'@'%' IDENTIFIED BY 'replpass';"
   sudo mysql -e "GRANT REPLICATION SLAVE ON *.* TO 'replication'@'%';"
   sudo mysql -e "FLUSH PRIVILEGES;"

   sudo mysql -e "ALTER USER 'replication'@'%' IDENTIFIED WITH mysql_native_password BY 'replpass';"
   sudo mysql -e "FLUSH PRIVILEGES;"
   ```

2. **Get Binary Log Position**:
   ```bash
   sudo mysql -e "SHOW MASTER STATUS\G"
   ```
   Note the File and Position values:
   ```bash
   *************************** 1. row ***************************
               File: binlog.000009
            Position: 870
      Binlog_Do_DB: 
   Binlog_Ignore_DB: 
   Executed_Gtid_Set:
   ```

3. **Configure Secondary Database VMs**:
   Install dependencies
   ```bash
   sudo cp ~/Capstone-Group-01/aws/ansible/templates/my.cnf.j2 /etc/mysql/my.cnf
   ```
   On the secondary database VM (all others?):
   ```bash
   sudo mysql -e "STOP SLAVE; RESET SLAVE; CHANGE MASTER TO MASTER_HOST='10.0.10.169', MASTER_USER='replication', MASTER_PASSWORD='replpass', MASTER_LOG_FILE='binlog.000009', MASTER_LOG_POS=870; START SLAVE;"
   
   ```
   Replace 'mysql-bin.000001' and '123' with the actual File and Position values from step 2.

4. **Verify Replication Status**:
   ```bash
   sudo mysql -e "SHOW SLAVE STATUS\G"
   ```
   Look for "Slave_IO_Running: Yes" and "Slave_SQL_Running: Yes".
   ```

   # RabbitMQ Cluster Setup Guide for AWS EC2

## Node Information
- **Master Node:** 10.0.0.21 (EC2 instance name: "messaging")
- **Second Node:** 10.0.10.169 (EC2 instance name: "database")
- **Third Node:** 10.0.13.3 (EC2 instance name: "backend")

## Step 1: Configure Host Entries on All Nodes

Perform these steps on **all three EC2 instances**:

**On Master Node (messaging - 10.0.0.21):**
```bash
sudo nano /etc/hosts

# Add these entries (don't remove existing entries)
10.0.0.21 messaging rabbit1
10.0.10.169 database rabbit2
10.0.13.3 backend rabbit3
```

**On Second Node (database - 10.0.10.169):**
```bash
sudo nano /etc/hosts

# Add these entries (don't remove existing entries)
10.0.0.21 messaging rabbit1
10.0.10.169 database rabbit2
10.0.13.3 backend rabbit3
```

**On Third Node (backend - 10.0.13.3):**
```bash
sudo nano /etc/hosts

# Add these entries (don't remove existing entries)
10.0.0.21 messaging rabbit1
10.0.10.169 database rabbit2
10.0.13.3 backend rabbit3
```

Verify hostname resolution on each node:
```bash
ping -c 2 rabbit1
ping -c 2 rabbit2
ping -c 2 rabbit3
```

## Step 2: Configure Erlang and RabbitMQ Settings on All Nodes

### 2.1 Set Up Erlang Networking (All Nodes)

On each of the three nodes, create/edit the Erlang inet configuration file:
```bash
sudo nano /etc/erl_inetrc
```

Add these lines:
```
{inet6, false}.
{lookup, [file, native]}.
```

### 2.2 Configure RabbitMQ Environment (All Nodes)

On each node, edit the RabbitMQ environment configuration:
```bash
sudo nano /etc/rabbitmq/rabbitmq-env.conf
```

Add these settings:
```
ERL_EPMD_ADDRESS=0.0.0.0
RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS="-proto_dist inet_tcp"
```

## Step 3: Configure Erlang Cookie on All Nodes

First, stop RabbitMQ on all nodes:

**On All Nodes:**
```bash
sudo systemctl stop rabbitmq-server
```

**On Master Node (messaging):**
Check the existing cookie:
```bash
sudo cat /var/lib/rabbitmq/.erlang.cookie
# Note down this value
```

**On All Nodes (including master):**
Set the same cookie value:
```bash
sudo sh -c 'echo "HOpsk8CSZBiHor+5Op0Rn7xmSCaxlWX9gpy0VLsB0OWjQ8dBMIUmLKiI" > /var/lib/rabbitmq/.erlang.cookie'
sudo chmod 400 /var/lib/rabbitmq/.erlang.cookie
sudo chown rabbitmq:rabbitmq /var/lib/rabbitmq/.erlang.cookie
```

## Step 4: Start RabbitMQ Services

### 4.1 Start Master Node First

**On Master Node (messaging):**
```bash
sudo systemctl start rabbitmq-server
```

Verify it's running:
```bash
sudo systemctl status rabbitmq-server
sudo rabbitmqctl status
```

Verify the actual node name:
```bash
sudo rabbitmqctl status | grep "Node name"
# Note: This will show something like "Node name: rabbit@ip-10-0-0-21"
```

### 4.2 Start Secondary Nodes

**On Second Node (database) and Third Node (backend):**
```bash
sudo systemctl start rabbitmq-server
```

## Step 5: Join Secondary Nodes to the Cluster

**On Second Node (database):**
```bash
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl join_cluster rabbit@ip-10-0-0-21
sudo rabbitmqctl start_app
```

**On Third Node (backend):**
```bash
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl join_cluster rabbit@ip-10-0-0-21
sudo rabbitmqctl start_app
```

## Step 6: Verify Cluster Status

**On Any Node:**
```bash
sudo rabbitmqctl cluster_status
```

You should see all three nodes listed in the cluster.

## Step 7: Enable Management Interface

**On All Nodes:**
```bash
sudo rabbitmq-plugins enable rabbitmq_management
```

## Step 8: Configure High Availability

**On Master Node (messaging):**
```bash
sudo rabbitmqctl set_policy ha-all ".*" '{"ha-mode":"all","ha-sync-mode":"automatic"}' --apply-to queues
```

## Step 9: Configure a Cluster Administrator User

**On Master Node (messaging):**
```bash
sudo rabbitmqctl add_user clusteradmin admin
sudo rabbitmqctl set_user_tags clusteradmin administrator
sudo rabbitmqctl set_permissions -p / clusteradmin ".*" ".*" ".*"
```

## Troubleshooting Tips

If you encounter connection issues:

1. **Verify Security Groups:**
   - Ensure AWS security groups allow traffic on ports:
     - 5672 (AMQP)
     - 15672 (Management UI)
     - 25672 (inter-node communication)
     - 4369 (epmd)
     - 35672-35682 (CLI tools)

2. **Check Hostname Resolution:**
   ```bash
   ping rabbit1
   ping rabbit2
   ping rabbit3
   ```

3. **Verify Erlang Cookie Consistency:**
   ```bash
   sudo cat /var/lib/rabbitmq/.erlang.cookie
   ```
   The value should be identical on all three nodes.

4. **Check RabbitMQ Logs:**
   ```bash
   sudo tail -f /var/log/rabbitmq/rabbit@$(hostname -s).log
   ```

5. **Verify epmd is Running:**
   ```bash
   epmd -names
   ```

6. **Reset a Problematic Node:**
   If a node won't join the cluster:
   ```bash
   sudo systemctl stop rabbitmq-server
   sudo rm -rf /var/lib/rabbitmq/mnesia/*
   sudo systemctl start rabbitmq-server
   # Then retry joining the cluster
   ```

7. **Use the Correct Node Name:**
   - If the hostname is different from what you expect, check the actual node name with:
   ```bash
   sudo rabbitmqctl status | grep "Node name"
   ```
   - Use this exact name (e.g., `rabbit@ip-10-0-0-21`) in your join_cluster command.