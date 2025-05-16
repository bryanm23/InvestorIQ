#!/bin/bash

# Cache Cleanup Cron Script
# This script runs the cache cleanup PHP script and can be added to crontab
# Recommended crontab entry: 0 * * * * /path/to/cleanup_cron.sh
# This will run the cleanup every hour

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Log file
LOG_FILE="$SCRIPT_DIR/cron_cleanup.log"

# Log start time
echo "$(date): Starting cache cleanup" >> "$LOG_FILE"

# Run the PHP cleanup script
php "$SCRIPT_DIR/cache_cleanup.php" >> "$LOG_FILE" 2>&1

# Log completion
echo "$(date): Cache cleanup completed" >> "$LOG_FILE"
echo "----------------------------------------" >> "$LOG_FILE"

# Make the log file readable
chmod 644 "$LOG_FILE"

exit 0
