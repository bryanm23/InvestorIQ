#!/bin/bash

WATCH_DIR="/home/mohamad/Desktop/Capstone-Group-01/backend"

# Remote targets (use IP addresses!)
REMOTE_TARGETS=(
  "root@MohamadAl:/home/mohamad/Desktop/Capstone-Group-01/backend/"
  "root@gcato:/home/gcato/Downloads/Capstone-Group-01/backend/"
)

# Delay after change detection
DELAY=3

echo -e "\nWatching $WATCH_DIR for changes... (Press Ctrl+C to stop)\n"

while true; do
    inotifywait -r -e modify,create,delete --exclude 'node_modules|\.git|\.swp' "$WATCH_DIR"
    echo "⏳ Change detected. Waiting $DELAY seconds for batch changes..."
    sleep $DELAY

    # Double check if more changes are happening
    CHANGES=$(inotifywait -r -e modify,create,delete --exclude 'node_modules|\.git|\.swp' --timeout 1 "$WATCH_DIR"; echo $?)
    if [ "$CHANGES" -eq 0 ]; then
        echo "⚡ More changes detected during wait. Skipping this sync cycle."
        continue
    fi

    echo "🚀 Syncing changes to all remote nodes..."

    for TARGET in "${REMOTE_TARGETS[@]}"; do
        echo "🔁 Syncing to $TARGET"
        rsync -az --delete --timeout=5 -e "ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no" "$WATCH_DIR/" "$TARGET"
        if [ $? -eq 0 ]; then
            echo "✅ Successfully synced to $TARGET"
        else
            echo "❌ Failed to sync to $TARGET"
        fi
    done

    echo "✨ All syncs completed.\n"
done

