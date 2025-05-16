#!/bin/bash

#created for documentation purposes, this script is actually ran locally on my machine.

STATS_URL="http://localhost:8404/;csv"
BACKEND_NAME="rabbitmq_nodes"
NODES=("root@bryan" "root@MohamadAl" "root@it490")

echo "Starting live RabbitMQ watchdog..."
while true; do
    UP_COUNT=$(curl -s "$STATS_URL" | grep "$BACKEND_NAME" | grep -v "BACKEND" >

    if [ "$UP_COUNT" -eq 0 ]; then
        echo "All RabbitMQ nodes are DOWN. Restarting..."
        for NODE in "${NODES[@]}"; do
    if [ "$NODE" == "root@bryan" ]; then
        echo "Restarting RabbitMQ locally on bryan..."
        sudo systemctl start rabbitmq-server
    else
        echo "Restarting RabbitMQ on $NODE..."
        ssh "$NODE" "systemctl restart rabbitmq-server"
    fi
done

        echo "Restart triggered. Sleeping 60s to avoid repeat restarts..."
        sleep 60
    else
        sleep 5
    fi
done
