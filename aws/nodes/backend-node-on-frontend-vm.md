# Backend Node on Frontend VM Configuration Guide

This document explains how to properly configure the backend node when it runs on the frontend VM during failover, ensuring that authentication requests (signup/login) work correctly without IP mismatches.

## Problem: IP Mismatch During Failover

When the backend node runs on the frontend VM during failover, a potential IP mismatch issue can occur:

1. The React frontend (SignUp.js, Login.js) makes requests to "/front_to_back_sender.php"
2. The front_to_back_sender.php script connects to RabbitMQ at 100.107.33.60 (Messaging VM)
3. The backend components (server.js, receivers, services) need to use identical queue names and connection settings

Without proper configuration, this can lead to:
- Authentication requests being sent to the wrong endpoint
- RabbitMQ connection issues
- Inconsistent queue usage

## Solution: Identical Backend Configuration

The good news is that your architecture already has consistent hardcoded IPs and queue names across all components. This means that when the backend node runs on the frontend VM, it will connect to the same RabbitMQ server and use the same queues as the backend node on the backend VM.

### Key Components to Ensure Consistency

1. **RabbitMQ Connection Settings**: All components connect to the same RabbitMQ server (100.107.33.60)
   - front_to_back_sender.php: `$RABBITMQ_HOST = "100.107.33.60";`
   - front_to_back_receiver.php: `$RABBITMQ_HOST = "100.107.33.60";`
   - db_to_be_receiver.php: `$RABBITMQ_HOST = "100.107.33.60";`
   - maps-controller.js: `const RABBITMQ_HOST = "100.107.33.60";`
   - rentcast-controller.js: `const RABBITMQ_HOST = "100.107.33.60";`
   - maps-service.js: `const RABBITMQ_HOST = "100.107.33.60";`
   - rentcast-service.js: `const RABBITMQ_HOST = "100.107.33.60";`

2. **Queue Names**: All components use the same queue names
   - frontend_to_backend (for auth operations)
   - maps_requests and maps_responses
   - rentcast_requests and rentcast_responses

3. **Database Connection**: All components connect to the same database server (100.82.47.115)
   - front_to_back_receiver.php: `$DB_HOST = "100.82.47.115";`
   - db_to_be_receiver.php: `$DB_HOST = "100.82.47.115";`

## Implementation Steps

### 1. Ensure All Backend Files Are Present on Frontend VM

Make sure these files are present on the frontend VM with identical content:
- backend/server.js
- backend/front_to_back_receiver.php
- backend/db_to_be_receiver.php
- backend/api/maps-controller.js
- backend/api/rentcast-controller.js
- backend/services/maps-service.js
- backend/services/rentcast-service.js

### 2. Create Backend Nginx Configuration on Frontend VM

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

### 3. Create Node.js Backend Service on Frontend VM

```bash
sudo nano /etc/systemd/system/node-app.service
```

Add the following content:

```
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

[Install]
WantedBy=multi-user.target
```

Adjust the user and path as needed for your environment.

### 4. Manual Failover Procedure

When you need to activate the backend on the frontend VM:

1. Disable the frontend Nginx configuration:
```bash
sudo rm -f /etc/nginx/sites-enabled/frontend
```

2. Enable the backend Nginx configuration:
```bash
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

3. Start the Node.js backend service:
```bash
sudo systemctl start node-app
```

4. Verify the backend service is running:
```bash
sudo systemctl status node-app
curl http://localhost:8079/health
```

### 5. Restoring Primary Services

When the primary backend VM is restored, follow these steps to deactivate the backup service:

```bash
sudo systemctl stop node-app
sudo rm -f /etc/nginx/sites-enabled/backend
sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Conclusion

This approach ensures that when the backend node runs on the frontend VM during failover:

1. The React frontend can still make requests to "/front_to_back_sender.php"
2. Nginx routes these requests to the local PHP server
3. The backend components use identical RabbitMQ and database connections
4. No code modifications are required to the PHP or JavaScript files

The solution maintains your original architecture while ensuring proper operation during failover scenarios.
