# Frontend and Backend Failover Configuration Guide

This guide provides detailed instructions for setting up the frontend and backend components within our clustered failover system architecture. The implementation uses Nginx configurations to ensure high availability through proper request routing.

## Architecture Overview

- **Frontend VM (100.71.100.5)**: Primary server for React frontend, also hosts backup backend node
- **Backend VM (100.70.91.110)**: Primary server for Node.js backend services, also hosts backup frontend node
- **Messaging VM (100.107.33.60)**: Primary RabbitMQ server, also serves as backup for frontend/backend
- **Database VM (100.82.47.115)**: Primary MySQL server, also serves as backup for backend

## Frontend Configuration (100.71.100.5)

### 1. Update React Code to Use Relative URLs

Before proceeding with the Nginx configuration, update the React code to use relative URLs instead of hardcoded IP addresses:

1. In `demo/src/pages/SignUp.js`, change:
```javascript
const response = await fetch("http://100.71.100.5:8000/front_to_back_sender.php", {
```
to:
```javascript
const response = await fetch("/front_to_back_sender.php", {
```

2. Similarly, in `demo/src/pages/Login.js`, change:
```javascript
const response = await fetch("http://100.71.100.5:8000/front_to_back_sender.php", {
```
to:
```javascript
const response = await fetch("/front_to_back_sender.php", {
```

3. Rebuild the React application:
```bash
cd ~/Downloads/Capstone-Group-01/demo
npm run build
```

### 2. Nginx Configuration for React Application

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

Install and configure Nginx to serve the React application:

```bash
sudo apt update
sudo apt install -y nginx
```

Create a configuration file for the frontend:

```bash
sudo nano /etc/nginx/sites-available/frontend
```

Add the following configuration:

```bash
server {
    listen 8079; 
    root /home/gcato/Downloads/Capstone-Group-01/demo/build;  # Full path to your React build directory
    index index.html;

    # Health check endpoint for monitoring
    location /health {
        access_log off;
        return 200 "healthy\n";
    }

    # Proxy requests to PHP server
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Add this new location block specifically for front_to_back_sender.php
    location = /front_to_back_sender.php {
        proxy_pass http://localhost:8000/front_to_back_sender.php;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Handle React routing (client-side routing)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo nano /etc/systemd/system/php-server.service
```
```bash
[Unit]
Description=PHP Development Server
After=network.target

[Service]
Type=simple
User=gcato
WorkingDirectory=/home/gcato/Downloads/Capstone-Group-01/demo
ExecStart=/usr/bin/php -S 0.0.0.0:8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl enable php-server.service
sudo systemctl start php-server.service
```


Enable the configuration:

```bash

sudo ufw allow 8079/tcp

sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # Remove default config if it exists
sudo nginx -t

sudo chmod -R 755 /home/gcato/Downloads/Capstone-Group-01/demo/build


sudo chmod 755 /home/gcato
sudo chmod 755 /home/gcato/Downloads
sudo chmod 755 /home/gcato/Downloads/Capstone-Group-01
sudo chmod 755 /home/gcato/Downloads/Capstone-Group-01/demo

sudo chown -R www-data:www-data /home/gcato/Downloads/Capstone-Group-01/demo/build

sudo ufw allow 8079/tcp

sudo systemctl restart nginx
```


## Backend Configuration (100.70.91.110)
```bash
sudo ufw allow 8079/tcp
```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

### 1. Node.js Application Setup

Install Node.js and set up the backend application:

```bash
cd ~/Capstone-Group-01/backend
npm install
```

### 2. Nginx as Reverse Proxy

Install and configure Nginx as a reverse proxy for the Node.js application:

```bash
sudo apt update
sudo apt install -y nginx
```

Create a configuration file for the backend:

```bash
sudo nano /etc/nginx/sites-available/backend
```

Add the following configuration:

```
server {
    listen 8079;

    # Health check endpoint for monitoring
    location /health {
        access_log off;
        return 200 "healthy\n";
    }

    # Node.js application
    location /api/ {
        proxy_pass http://localhost:8081/;  # Node.js backend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Add this location block to handle authentication requests when frontend is on backend VM
    location = /front_to_back_sender.php {
        proxy_pass http://localhost:8000/front_to_back_sender.php;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration:

```bash
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # Remove default if it exists
sudo nginx -t
sudo systemctl restart nginx
```

## Failover System Components

### 1. Health Check Service

The health check service runs on all VMs and reports their status to the monitoring service via RabbitMQ. It checks the status of critical services on each VM and sends heartbeat messages.

Key features:
- Runs as a systemd service on all VMs
- Sends heartbeat messages every 30 seconds
- Reports the status of critical services (Nginx, Node.js, RabbitMQ, MySQL)
- Falls back to a secondary RabbitMQ server if the primary is unavailable

The health check service is defined in `~/Capstone-Group-01/aws/services/health/health_check.py` and its systemd unit file is in `~/Capstone-Group-01/aws/services/health/health-check.service`.

### 2. Monitoring Service

The monitoring service runs on both the Messaging VM (primary) and Frontend VM (backup). It receives heartbeat messages from all VMs and triggers failover when a service fails.

Key features:
- Runs as a systemd service on Messaging and Frontend VMs
- Monitors heartbeat messages from all VMs
- Detects when a service fails and triggers failover
- Detects when a primary service recovers and triggers failback
- Supports leader election to ensure only one monitoring service is active
- Provides a REST API for health checks

The monitoring service is defined in `~/Capstone-Group-01/aws/services/monitor/monitor.py` and its systemd unit file is in `~/Capstone-Group-01/aws/services/monitor/failover-monitor.service`.

### 3. Ansible Worker

The Ansible worker runs on both the Messaging VM and Frontend VM. It listens for failover and failback commands from the monitoring service and executes the appropriate Ansible playbooks.

Key features:
- Runs as a systemd service on Messaging and Frontend VMs
- Listens for commands on a RabbitMQ queue
- Executes Ansible playbooks to activate or deactivate services
- Falls back to a secondary RabbitMQ server if the primary is unavailable

The Ansible worker is defined in `~/Capstone-Group-01/aws/services/worker/ansible_worker.py` and its systemd unit file is in `~/Capstone-Group-01/aws/services/worker/ansible-worker.service`.

### 4. Ansible Playbooks

The Ansible playbooks are used to activate and deactivate services on different VMs. They are stored on both the Messaging VM and Frontend VM.

Key playbooks:
- `activate_frontend.yml`: Activates the frontend service on a backup VM
- `activate_backend.yml`: Activates the backend service on a backup VM
- `activate_messaging.yml`: Activates the RabbitMQ service on a backup VM
- `activate_database.yml`: Activates the MySQL service on a backup VM
- `deactivate_frontend.yml`: Deactivates the frontend service on a backup VM
- `deactivate_backend.yml`: Deactivates the backend service on a backup VM
- `deactivate_messaging.yml`: Deactivates the RabbitMQ service on a backup VM
- `deactivate_database.yml`: Deactivates the MySQL service on a backup VM

The playbooks are stored in `~/Capstone-Group-01/aws/ansible/playbooks/`.

## Round-Robin Service Activation

The round-robin service activation approach allows services to be dynamically activated on different VMs based on load and availability. This is implemented through the monitoring service.

Key features:
- Services can be activated on any VM in a round-robin fashion
- Scheduled rotation of services to balance load
- Configurable rotation interval (default: 24 hours)
- Exclusion of specific services from rotation

Configuration for round-robin activation is stored in `/opt/monitoring/config.json`.

## Testing the Failover System

### 1. Verify all services are running

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

### 2. Test Frontend Failover

Simulate a frontend service failure:

```bash
# On frontend VM (10.0.8.49)
sudo systemctl stop nginx
```

Monitor logs to see if failure is detected:

```bash
# On messaging VM (10.0.0.21)
tail -f /var/log/failover-monitor.log
```

Check if backup frontend service is activated:

```bash
# On backend VM (10.0.0.22) or messaging VM (10.0.0.21)
sudo systemctl status nginx
```

### 3. Test Backend Failover

Simulate a backend service failure:

```bash
# On backend VM (10.0.0.22)
sudo systemctl stop nginx
```

Monitor logs to see if failure is detected:

```bash
# On messaging VM (10.0.0.21)
tail -f /var/log/failover-monitor.log
```

Check if backup backend service is activated:

```bash
# On frontend VM (10.0.8.49) or database VM (10.0.10.169)
sudo systemctl status nginx
```

### 4. Test Automatic Failback

After testing failover, restart the service on the primary VM:

```bash
# On frontend VM (10.0.8.49) or backend VM (10.0.0.22)
sudo systemctl start nginx
```

Monitor logs to see if recovery is detected and failback is triggered:

```bash
# On messaging VM (10.0.0.21)
tail -f /var/log/failover-monitor.log
```

Check if backup service is deactivated:

```bash
# On the backup VM
sudo systemctl status nginx
```

## Manual Setup for Backup Nodes

This section provides instructions for manually setting up backup nodes on each VM without relying on Ansible playbooks. This allows for a more direct control over the failover process.

### Setting Up Backup Backend Node on Frontend VM (100.71.100.5)

These steps will configure the Frontend VM to also host a backup of the backend Node.js service that can be manually activated when needed.

#### 1. Install Backend Dependencies

Node.js should already be installed from the frontend setup. Verify with:

```bash
node --version
npm --version
```

#### 2. Set Up Backend Application

Clone or copy the backend application code:

```bash
# Create directory if it doesn't exist
mkdir -p ~/Capstone-Group-01/backend

# Copy backend files from Backend VM (if needed)
# scp -r user@100.70.91.110:~/Capstone-Group-01/backend/* ~/Capstone-Group-01/backend/

# Install dependencies
cd ~/Capstone-Group-01/backend
npm install
```

#### 3. Create Node.js Backend Service

Create a systemd service file for the Node.js backend application:

```bash
sudo nano /etc/systemd/system/node-app.service
```

Add the following content:

```bash
[Unit]
Description=Node.js Backend Application
After=network.target

[Service]
Type=simple
User=gcato
WorkingDirectory=/home/gcato/Downloads/Capstone-Group-01/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=8081
# Add any other environment variables needed

[Install]
WantedBy=multi-user.target
```

Register the service but don't enable it by default:

```bash
sudo systemctl daemon-reload
```

#### 4. Create Backend Nginx Configuration

Create a separate Nginx configuration file for the backend service:

```bash
sudo nano /etc/nginx/sites-available/backend
```

Add the following configuration:

```bash
server {
    listen 8079;
    server_name backend;

    # Health check endpoint for monitoring
    location /health {
        access_log off;
        return 200 "healthy\n";
    }

    # Node.js application
    location /api/ {
        proxy_pass http://localhost:8081/;  # Node.js backend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Add this location block to handle authentication requests when backend is on frontend VM
    location = /front_to_back_sender.php {
        proxy_pass http://localhost:8000/front_to_back_sender.php;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Note: Don't enable this configuration yet, as it would conflict with the frontend configuration on the same port.

### Setting Up Backup Frontend Node on Backend VM (100.70.91.110)

These steps will configure the Backend VM to also host a backup of the frontend React service that can be manually activated when needed.

#### 1. Set Up React Application

Clone repo and copy the React build files:

```bash
# Located in ~/Capstone-Group-01/demo/build/
```

Set appropriate permissions:

```bash
chmod -R 755 ~/Capstone-Group-01/demo/build
```

#### 2. Create PHP Server Service

Create a systemd service file for the PHP server:

```bash
sudo nano /etc/systemd/system/php-server.service
```

Add the following content:

```bash
[Unit]
Description=PHP Development Server
After=network.target

[Service]
Type=simple
User=gcato
WorkingDirectory=/home/mohamad/Capstone-Group-01/demo #CHANGE THIS TO YOUR VM PATH 
ExecStart=/usr/bin/php -S localhost:8000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Register the service but don't enable it by default:

```bash
sudo systemctl daemon-reload
```

#### 3. Create Frontend Nginx Configuration

Create a separate Nginx configuration file for the frontend service:

```bash
sudo nano /etc/nginx/sites-available/frontend
```

Add the following configuration:

```bash
server {
    listen 8079;
    server_name frontend;
    root /home/mohamad//Capstone-Group-01/demo/build; #CHANGE PROPER PATHS
    index index.html;

    # Health check endpoint for monitoring
    location /health {
        access_log off;
        return 200 "healthy\n";
    }

    # Proxy requests to PHP server
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Add this new location block specifically for front_to_back_sender.php
    location = /front_to_back_sender.php {
        proxy_pass http://localhost:8000/front_to_back_sender.php;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Handle React routing (client-side routing)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Note: Don't enable this configuration yet, as it would conflict with the backend configuration on the same port.

## Manual Failover Procedures

### Activating Backend on Frontend VM

When the primary backend VM fails, follow these steps to manually activate the backend service on the frontend VM:

1. Disable the frontend Nginx configuration:

```bash
# On Frontend VM (100.71.100.5)
sudo rm -f /etc/nginx/sites-enabled/frontend
```

2. Enable the backend Nginx configuration:

```bash
# On Frontend VM (100.71.100.5)
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

3. Start the Node.js backend service:

```bash
# On Frontend VM (100.71.100.5)
sudo systemctl start node-app
```

4. Verify the backend service is running:

```bash
# On Frontend VM (100.71.100.5)
sudo systemctl status node-app
curl http://localhost:8079/health
```

### Activating Frontend on Backend VM

When the primary frontend VM fails, follow these steps to manually activate the frontend service on the backend VM:

1. Disable the backend Nginx configuration:

```bash
# On Backend VM (100.70.91.110)
sudo rm -f /etc/nginx/sites-enabled/backend
```

2. Enable the frontend Nginx configuration:

```bash
# On Backend VM (100.70.91.110)
sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

3. Start the PHP server service:

```bash
# On Backend VM (100.70.91.110)
sudo systemctl start php-server
```

4. Verify the frontend service is running:

```bash
# On Backend VM (100.70.91.110)
sudo systemctl status php-server
curl http://localhost:8079/health
```

### Restoring Primary Services

When the primary VM is restored, follow these steps to deactivate the backup service and restore the primary service:

#### Deactivating Backend on Frontend VM:

```bash
# On Frontend VM (100.71.100.5)
sudo systemctl stop node-app
sudo rm -f /etc/nginx/sites-enabled/backend
sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Deactivating Frontend on Backend VM:

```bash
# On Backend VM (100.70.91.110)
sudo systemctl stop php-server
sudo rm -f /etc/nginx/sites-enabled/frontend
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Troubleshooting

### Check Connectivity Between VMs

```bash
ping <vm-ip-address>
```

### Verify Service Status

```bash
# Check Nginx status
sudo systemctl status nginx

# Check Node.js backend status
sudo systemctl status node-app

# Check PHP server status
sudo systemctl status php-server
```

### Verify Nginx Configuration

```bash
sudo nginx -t
```

### Check Nginx Logs

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Test Health Endpoints

```bash
# Frontend health
curl http://100.71.100.5:8079/health

# Backend health
curl http://100.70.91.110:8079/health

# Backup backend on frontend VM
curl http://100.71.100.5:8079/health  # When backend is active

# Backup frontend on backend VM
curl http://100.70.91.110:8079/health  # When frontend is active
```

### Key Differences Between Frontend and Backend Configurations

1. **Different Content Serving Methods**:
   - Frontend NGINX serves static files from a React build directory
   - Backend NGINX acts as a reverse proxy to a Node.js application running on port 8081

2. **Different Configuration Elements**:
   - Frontend has a root directive and index directive, while backend doesn't
   - Backend focuses on proxy settings for the Node.js application

3. **Different Underlying Services**:
   - Frontend manages a React application with a PHP server for API requests
   - Backend manages a Node.js application

4. **Different Service Management**:
   - Frontend requires managing the PHP server service
   - Backend requires managing the Node.js application service

## IP Mismatch Solution Explanation

The changes implemented in this guide address the potential IP mismatch issue that could occur during failover scenarios. Here's how the solution works:

### Problem:
- Previously, the React code in SignUp.js and Login.js had hardcoded IP addresses (http://100.71.100.5:8000/front_to_back_sender.php)
- During failover, if the frontend was running on the backend VM (100.70.91.110), these hardcoded requests would still try to reach the original frontend VM (100.71.100.5), which might be down

### Solution:
1. **Use Relative URLs in React Code**:
   - Changed fetch URLs from absolute (http://100.71.100.5:8000/front_to_back_sender.php) to relative (/front_to_back_sender.php)
   - This makes the React app send requests to whatever server is currently hosting it

2. **Configure Nginx on Both VMs to Handle Authentication Requests**:
   - Added a location block for /front_to_back_sender.php in both frontend and backend Nginx configurations
   - Each configuration proxies the request to the local PHP server running on port 8000
   - This ensures authentication requests are properly handled regardless of which VM is hosting the frontend

3. **Ensure PHP Server is Available on Both VMs**:
   - Both VMs have the PHP server service configured to run on port 8000
   - The service is started during failover to handle authentication requests

This approach maintains your original architecture while making the frontend code portable between VMs. The key insight is that by using relative URLs, the browser automatically sends requests to the current host, and Nginx routes them to the appropriate local service.
