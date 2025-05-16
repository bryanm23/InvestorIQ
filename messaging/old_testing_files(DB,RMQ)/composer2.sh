#!/bin/bash

# Get the Tailscale IP of the local machine, to see who is running what
TAILSCALE_IP=$(tailscale ip -4)

# Define Tailscale IPs for each user, referenced below
FRONTEND_IP="100.71.100.5"
RABBITMQ_IP="100.107.33.60"
MYSQL_IP="100.82.47.115"
BACKEND_IP="100.82.166.82"

# Function to check and start services locally (for users that are hosting their own service.)
run_locally() {
    case "$1" in
        "Frontend")
            echo "Checking Frontend status locally..."
            cd ~/Downloads/Capstone-Group-01/demo || { echo "Demo directory not found!"; exit 1; }
            if pgrep -f "react-scripts" > /dev/null; then
                echo "Frontend service is already running."
            else
                echo "Starting Frontend Service..."
                nohup ./start-frontend.sh 2>&1 &
                disown
                echo "Frontend service started successfully."
            fi
            ;;
        "RabbitMQ")
            echo "Checking RabbitMQ status locally..."
            if ss -tuln | grep -q ':5672'; then
                echo "RabbitMQ is already running on port 5672."
            else
                echo "RabbitMQ is not running on port 5672. Starting RabbitMQ service..."
                sudo systemctl start rabbitmq-server
                echo "RabbitMQ service started successfully."
            fi
            ;;
        "MySQL")
            echo "Checking MariaDB status locally..."
            if ss -tuln | grep -q ':3306'; then
                echo "MariaDB is already running on port 3306."
            else
                echo "MariaDB is not running on port 3306. Starting MariaDB service..."
                sudo systemctl start mariadb
                echo "MariaDB service started successfully."
            fi
            ;;
        "Backend")
            echo "Checking Backend status locally..."
            cd /home/mohamad/Desktop/Capstone-Group-01/backend || { echo "Backend directory not found!"; exit 1; }
            if ss -tuln | grep -q ':8081'; then
                echo "Backend service is already running on port 8081."
            else
                echo "Starting Backend Service..."
                nohup node server.js 2>&1 &
                disown
                echo "Backend Service started successfully."
            fi
            ;;
        *)
            echo "Unknown service: $1"
            ;;
    esac
}

# Function so remote code can actually work
run_remote() {
    local USER=$1
    local IP=$2
    local CMD=$3
    ssh 'root'@$IP << EOF
    $CMD
    exit 0
EOF
}

# Frontend Remote
if [[ "$TAILSCALE_IP" == "$FRONTEND_IP" ]]; then
    run_locally "Frontend"
else
    run_remote "gcato" "$FRONTEND_IP" "
        cd ~/Downloads/Capstone-Group-01/demo || { echo 'Demo directory not found!'; exit 1; }
        if pgrep -f 'react-scripts' > /dev/null; then
            echo 'Frontend service is already running.'
        else
            echo 'Starting Frontend Service...'
            sudo systemctl enable nginx
            echo 'Frontend service started successfully.'
        fi
        exit 0
    "
fi

# RabbitMQ Remote
if [[ "$TAILSCALE_IP" == "$RABBITMQ_IP" ]]; then
    run_locally "RabbitMQ"
else
    run_remote "bryan" "$RABBITMQ_IP" "
        if ss -tuln | grep -q ':5672'; then
            echo 'RabbitMQ is already running on port 5672.'
        else
            echo 'Starting RabbitMQ service...'
            sudo systemctl start rabbitmq-server
            echo 'RabbitMQ service started successfully.'
        fi
        exit 0
    "
fi

# MySQL Remote
if [[ "$TAILSCALE_IP" == "$MYSQL_IP" ]]; then
    run_locally "MySQL"
else
    run_remote "leo" "$MYSQL_IP" "
        if ss -tuln | grep -q ':3306'; then
            echo 'MariaDB is already running on port 3306.'
        else
            echo 'Starting MariaDB service...'
            systemctl start mariadb
            echo 'MariaDB service started successfully.'
        fi
        exit 0
    "
fi

# Backend Remote
if [[ "$TAILSCALE_IP" == "$BACKEND_IP" ]]; then
    run_locally "Backend"
else
    run_remote "mohamad" "$BACKEND_IP" "
        cd /home/mohamad/Desktop/Capstone-Group-01/backend || { echo 'Backend directory not found!'; exit 1; }
        if ss -tuln | grep -q ':8081'; then
            echo 'Backend service is already running on port 8081.'
        else
            echo 'Starting Backend Service...'
            nohup node server.js 2>&1 &
            disown
            echo 'Backend Service started successfully.'
        fi
        exit 0
    "
fi

