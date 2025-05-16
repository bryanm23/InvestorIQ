#!/bin/bash

# Get the Tailscale IP of the local machine, to see who is running what
TAILSCALE_IP=$(tailscale ip -4)

# Define Tailscale IPs for each user, referenced below
FRONTEND_IP="100.71.100.5"
RABBITMQ_IP="100.107.33.60"
MYSQL_IP="100.82.47.115"
BACKEND_IP="100.82.166.82"

# Function to check if an IP is reachable before SSH
is_up() {
    local ip=$1
    ping -c 1 -W 1 $ip > /dev/null 2>&1
}


# Function to check if a service is running and start it if not
check_service() {
    local service=$1
    
    echo "Checking $service status..."
    
    # Check if service is active using systemctl is-active
    if ! systemctl is-active --quiet "$service"; then
        echo "$service is not running. Attempting to start..."
        
        # Enable and start the service
        if sudo systemctl enable "$service" && sudo systemctl start "$service"; then
            echo "SUCCESS: $service has been started successfully!"
        else
            echo "ERROR: Failed to start $service."
        fi
    else
        echo "$service is already running."
    fi
    
    echo "" # Empty line for better readability
}

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
                echo "RabbitMQ is not running on port 5672. Enabling and starting RabbitMQ service..."
                sudo systemctl enable rabbitmq-server && sudo systemctl start rabbitmq-server
                echo "RabbitMQ service started successfully."
            fi
            ;;
        "MySQL")
            echo "Checking MariaDB status locally..."
            if ss -tuln | grep -q ':3306'; then
                echo "MariaDB is already running on port 3306."
            else
                echo "MariaDB is not running on port 3306. Enabling and starting MariaDB service..."
                sudo systemctl enable mariadb && sudo systemctl start mariadb
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
    # Check frontend service (nginx)
    check_service "nginx"
    # Check backend node on frontend VM
    check_service "node-app.service"
else
    run_remote "root" "$FRONTEND_IP" "
        # This script checks if nginx and node-app services are running
        # If not, it starts them and prints a status message
        
        check_service() {
            local service=\$1
            
            echo \"Checking \$service status...\"
            
            # Check if service is active using systemctl is-active
            if ! systemctl is-active --quiet \"\$service\"; then
                echo \"\$service is not running. Attempting to start...\"
                
                # Enable and start the service
                if systemctl enable \"\$service\" && systemctl start \"\$service\"; then
                    echo \"SUCCESS: \$service has been started successfully!\"
                else
                    echo \"ERROR: Failed to start \$service.\"
                fi
            else
                echo \"\$service is already running.\"
            fi
            
            echo \"\" # Empty line for better readability
        }
        
        # Check nginx
        check_service \"nginx\"
        # Check node-app
        check_service \"node-app.service\"
        exit 0
    "
fi

# RabbitMQ Remote
if [[ "$TAILSCALE_IP" == "$RABBITMQ_IP" ]]; then
    # Check primary RabbitMQ service
    check_service "rabbitmq-server"
    # Also check MariaDB on messaging VM
    check_service "mariadb"
else
    run_remote "root" "$RABBITMQ_IP" "
        # This script checks if rabbitmq-server and mariadb services are running
        # If not, it starts them and prints a status message
        
        check_service() {
            local service=\$1
            
            echo \"Checking \$service status...\"
            
            # Check if service is active using systemctl is-active
            if ! systemctl is-active --quiet \"\$service\"; then
                echo \"\$service is not running. Attempting to start...\"
                
                # Enable and start the service
                if systemctl enable \"\$service\" && systemctl start \"\$service\"; then
                    echo \"SUCCESS: \$service has been started successfully!\"
                else
                    echo \"ERROR: Failed to start \$service.\"
                fi
            else
                echo \"\$service is already running.\"
            fi
            
            echo \"\" # Empty line for better readability
        }
        
        # Check RabbitMQ
        check_service \"rabbitmq-server\"
        # Check MariaDB
        check_service \"mariadb\"
        exit 0
    "
fi

# MySQL Remote
if [[ "$TAILSCALE_IP" == "$MYSQL_IP" ]]; then
    # Check primary MariaDB service
    check_service "mariadb"
    # Also check RabbitMQ on database VM
    check_service "rabbitmq-server"
else
    run_remote "root" "$MYSQL_IP" "
        # This script checks if mariadb and rabbitmq-server services are running
        # If not, it starts them and prints a status message
        
        check_service() {
            local service=\$1
            
            echo \"Checking \$service status...\"
            
            # Check if service is active using systemctl is-active
            if ! systemctl is-active --quiet \"\$service\"; then
                echo \"\$service is not running. Attempting to start...\"
                
                # Enable and start the service
                if systemctl enable \"\$service\" && systemctl start \"\$service\"; then
                    echo \"SUCCESS: \$service has been started successfully!\"
                else
                    echo \"ERROR: Failed to start \$service.\"
                fi
            else
                echo \"\$service is already running.\"
            fi
            
            echo \"\" # Empty line for better readability
        }
        
        # Check MariaDB
        check_service \"mariadb\"
        # Check RabbitMQ
        check_service \"rabbitmq-server\"
        exit 0
    "
fi

# Backend Remote
if [[ "$TAILSCALE_IP" == "$BACKEND_IP" ]]; then
    # Check backend service (nginx)
    check_service "nginx"
    # Check frontend node on backend VM
    check_service "node-app.service"
    # Check RabbitMQ on backend VM
    check_service "rabbitmq-server"
    # Check MariaDB on backend VM
    check_service "mariadb"
else
    run_remote "root" "$BACKEND_IP" "
        # This script checks if nginx, node-app, rabbitmq-server, and mariadb services are running
        # If not, it starts them and prints a status message
        
        check_service() {
            local service=\$1
            
            echo \"Checking \$service status...\"
            
            # Check if service is active using systemctl is-active
            if ! systemctl is-active --quiet \"\$service\"; then
                echo \"\$service is not running. Attempting to start...\"
                
                # Enable and start the service
                if systemctl enable \"\$service\" && systemctl start \"\$service\"; then
                    echo \"SUCCESS: \$service has been started successfully!\"
                else
                    echo \"ERROR: Failed to start \$service.\"
                fi
            else
                echo \"\$service is already running.\"
            fi
            
            echo \"\" # Empty line for better readability
        }
        
        # Check nginx
        check_service \"nginx\"
        # Check node-app
        check_service \"node-app.service\"
        # Check RabbitMQ
        check_service \"rabbitmq-server\"
        # Check MariaDB
        check_service \"mariadb\"
        exit 0
    "
fi
