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

        # Try to start the service
        if sudo systemctl start "$service" & disown; then
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
                echo "RabbitMQ is not running on port 5672. Starting RabbitMQ service..."
                sudo systemctl start rabbitmq-server & disown
                echo "RabbitMQ service started successfully."
            fi
            ;;
        "MySQL")
            echo "Checking MariaDB status locally..."
            if ss -tuln | grep -q ':3306'; then
                echo "MariaDB is already running on port 3306."
            else
                echo "MariaDB is not running on port 3306. Starting MariaDB service..."
                sudo systemctl start mariadb & disown
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
    ssh -T 'root'@$IP << EOF
    $CMD
    exit 0
EOF
}

# Frontend Remote
if [[ "$TAILSCALE_IP" == "$FRONTEND_IP" ]]; then
    check_service "nginx"
    check_service "node-app.service"
else
    if is_up "$FRONTEND_IP"; then
        run_remote "root" "$FRONTEND_IP" "
            check_service() {
                local service=\$1
                echo \"Checking \$service status...\"
                if ! systemctl is-active --quiet \"\$service\"; then
                    echo \"\$service is not running. Attempting to start...\"
                    if systemctl start \"\$service\" & disown; then
                        echo \"SUCCESS: \$service has been started successfully!\"
                    else
                        echo \"ERROR: Failed to start \$service.\"
                    fi
                else
                    echo \"\$service is already running.\"
                fi
                echo \"\"
            }
            check_service \"nginx\"
            check_service \"node-app.service\"
        "
    else
        echo "$FRONTEND_IP is unreachable. Skipping remote commands."
    fi
fi

# RabbitMQ Remote
if [[ "$TAILSCALE_IP" == "$RABBITMQ_IP" ]]; then
    check_service "rabbitmq-server"
    check_service "mariadb"
else
    if is_up "$RABBITMQ_IP"; then
        run_remote "root" "$RABBITMQ_IP" "
            check_service() {
                local service=\$1
                echo \"Checking \$service status...\"
                if ! systemctl is-active --quiet \"\$service\"; then
                    echo \"\$service is not running. Attempting to start...\"
                    if systemctl start \"\$service\" & disown; then
                        echo \"SUCCESS: \$service has been started successfully!\"
                    else
                        echo \"ERROR: Failed to start \$service.\"
                    fi
                else
                    echo \"\$service is already running.\"
                fi
                echo \"\"
            }
            check_service \"rabbitmq-server\"
            check_service \"mariadb\"
        "
    else
        echo "$RABBITMQ_IP is unreachable. Skipping remote commands."
    fi
fi

# MySQL Remote
if [[ "$TAILSCALE_IP" == "$MYSQL_IP" ]]; then
    check_service "mariadb"
    check_service "rabbitmq-server"
else
    if is_up "$MYSQL_IP"; then
        run_remote "root" "$MYSQL_IP" "
            check_service() {
                local service=\$1
                echo \"Checking \$service status...\"
                if ! systemctl is-active --quiet \"\$service\"; then
                    echo \"\$service is not running. Attempting to start...\"
                    if systemctl start \"\$service\" & disown; then
                        echo \"SUCCESS: \$service has been started successfully!\"
                    else
                        echo \"ERROR: Failed to start \$service.\"
                    fi
                else
                    echo \"\$service is already running.\"
                fi
                echo \"\"
            }
            check_service \"mariadb\"
            check_service \"rabbitmq-server\"
        "
    else
        echo "$MYSQL_IP is unreachable. Skipping remote commands."
    fi
fi

# Backend Remote
if [[ "$TAILSCALE_IP" == "$BACKEND_IP" ]]; then
    check_service "nginx"
    check_service "node-app.service"
    check_service "rabbitmq-server"
    check_service "mariadb"
else
    if is_up "$BACKEND_IP"; then
        run_remote "root" "$BACKEND_IP" "
            check_service() {
                local service=\$1
                echo \"Checking \$service status...\"
                if ! systemctl is-active --quiet \"\$service\"; then
                    echo \"\$service is not running. Attempting to start...\"
                    if systemctl start \"\$service\" & disown; then
                        echo \"SUCCESS: \$service has been started successfully!\"
                    else
                        echo \"ERROR: Failed to start \$service.\"
                    fi
                else
                    echo \"\$service is already running.\"
                fi
                echo \"\"
            }
            check_service \"nginx\"
            check_service \"node-app.service\"
            check_service \"rabbitmq-server\"
            check_service \"mariadb\"
        "
    else
        echo "$BACKEND_IP is unreachable. Skipping remote commands."
    fi
fi
