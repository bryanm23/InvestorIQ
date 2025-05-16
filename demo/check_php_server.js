// check_php_server.js
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = 8080;
const CHECK_INTERVAL = 60000; // Check every minute
const LOG_FILE = path.join(__dirname, 'php_server.log');

// Log function
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// Check if the PHP server is running
function checkServer() {
  log('Checking PHP server status...');
  
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: '/front_to_back_sender.php',
    method: 'OPTIONS',
    timeout: 3000
  }, (res) => {
    if (res.statusCode === 200) {
      log('PHP server is running correctly');
    } else {
      log(`PHP server returned unexpected status code: ${res.statusCode}`);
      startServer();
    }
    
    // Consume response data to free up memory
    res.resume();
  });
  
  req.on('error', (e) => {
    log(`PHP server check failed: ${e.message}`);
    startServer();
  });
  
  req.on('timeout', () => {
    log('PHP server check timed out');
    req.destroy();
    startServer();
  });
  
  req.end();
}

// Start the PHP server
function startServer() {
  log('Starting PHP server...');
  
  // Kill any existing PHP server processes
  exec('taskkill /F /IM php.exe', (error) => {
    // Ignore errors from taskkill as it will error if no PHP processes exist
    
    // Start a new PHP server
    const phpServer = exec('php -S localhost:8080 -t .', (error, stdout, stderr) => {
      if (error) {
        log(`PHP server error: ${error.message}`);
        return;
      }
      
      if (stderr) {
        log(`PHP server stderr: ${stderr}`);
      }
    });
    
    phpServer.stdout.on('data', (data) => {
      log(`PHP server: ${data.trim()}`);
    });
    
    phpServer.stderr.on('data', (data) => {
      log(`PHP server error: ${data.trim()}`);
    });
    
    log('PHP server started');
  });
}

// Initial check
log('PHP server watchdog started');
checkServer();

// Schedule regular checks
setInterval(checkServer, CHECK_INTERVAL);
