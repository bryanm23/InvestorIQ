#!/bin/bash

# Exit script if any command fails
set -e

echo "Starting React application and PHP server..."
echo "Starting React application with 'npm run start-react'..."
npm run start-react &
REACT_PID=$!

