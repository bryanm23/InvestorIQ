#!/bin/bash

# Script to kill processes running on ports 7012 and 8000

echo "Checking for processes on ports 7012 and 8000..."

# Find and kill REACT process on port 7012
PID_7012=$(lsof -t -i:7012)
if [ -n "$PID_7012" ]; then
    echo "Found process $PID_7012 running on port 7012, killing it..."
    kill -9 $PID_7012
    echo "Process on port 7012 killed."
else
    echo "No process found running on port 7012."
fi

# Find and kill PHP process on port 8000
PID_8000=$(lsof -t -i:8000)
if [ -n "$PID_8000" ]; then
    echo "Found process $PID_8000 running on port 8000, killing it..."
    kill -9 $PID_8000
    echo "Process on port 8000 killed."
else
    echo "No process found running on port 8000."
fi

echo "Done."