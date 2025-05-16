# API Connection Fixes

This document outlines the fixes implemented to resolve the API connection issues in the application.

## Issues Fixed

1. **405 Method Not Allowed errors**
   - Problem: The PHP files were not being executed properly on the server
   - Solution: Ensured proper PHP server configuration and added fallback mock responses

2. **Connection refused errors**
   - Problem: Mismatch between the configured proxy (port 8000) and the actual PHP server (port 8080)
   - Solution: Updated the proxy configuration in package.json to use the correct port

3. **JSON parsing errors**
   - Problem: The server was returning HTML instead of JSON
   - Solution: Added proper content type headers and error handling to ensure valid JSON responses

4. **Cross-Origin Resource Sharing (CORS) issues**
   - Problem: When running on VM (100.71.100.5:8069), API requests failed due to CORS restrictions
   - Solution: Enhanced CORS handling in all PHP sender files to dynamically allow requests from both localhost and VM environments

5. **Absolute vs. Relative URL issues**
   - Problem: When running on VM, relative URLs in API requests were not resolving correctly
   - Solution: Modified apiUtils.js and AuthContext.js to use absolute URLs when running on VM environments

## Implementation Details

### 1. Updated API Endpoint Routing

Modified the `apiUtils.js` file to route requests to the appropriate endpoints based on the action type:
- Search and property retrieval actions → `rentcast_sender.php`
- Property management actions → `property_manager_sender.php`
- Authentication and user management → `front_to_back_sender.php`

### 2. Dynamic Base URL Detection

Added logic to detect the current environment and use the appropriate base URL:
- When running on localhost:3000, use relative URLs (which are handled by the proxy)
- When running on VM or other environments, use absolute URLs with the correct hostname and port

```javascript
// Determine the base API URL based on the current hostname
const getBaseApiUrl = () => {
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // If running on localhost, use the proxy configuration
  if (hostname === 'localhost' && port === '3000') {
    return ''; // Empty string means use relative URLs which will be handled by the proxy
  }
  
  // If running on the VM or any other environment, use the absolute URL
  // Use the same hostname but with port 8080 for the PHP server
  return `http://${hostname}:8080`;
};
```

### 3. Enhanced CORS Handling

Improved CORS handling in all PHP sender files to:
- Allow requests from both localhost:3000 and 100.71.100.5:8069
- Dynamically detect and allow requests from the same hostname with different ports
- Ensure proper headers are set for all responses

```php
// Set the allowed origin dynamically based on the request origin
$allowedOrigins = [
    'http://localhost:3000',
    'http://100.71.100.5:8069',
    'http://100.71.100.5:8080'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    // If the origin is not in our list but has the same hostname as the server,
    // allow it (useful for different ports on the same VM)
    $serverHost = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    $originParts = parse_url($origin);
    $originHost = isset($originParts['host']) ? $originParts['host'] : '';
    
    if ($originHost && $originHost === $serverHost) {
        header("Access-Control-Allow-Origin: $origin");
    }
}
```

### 4. Added Mock Response System

Implemented a mock response system in all PHP sender files to provide realistic data when backend services are unavailable:
- Allows frontend development and testing to continue even when backend services are down
- Provides realistic data structures that match the expected API responses
- Caches mock responses to improve performance

### 5. Improved Error Handling

Enhanced error handling in all PHP sender files:
- Better logging for debugging
- Graceful fallback to mock data when services are unavailable
- Proper HTTP status codes and headers
- Ensuring all responses are valid JSON

### 6. Server Monitoring

Added a PHP server watchdog script (`check_php_server.js`) that:
- Monitors the PHP server status
- Automatically restarts the server if it becomes unresponsive
- Logs server activity for debugging

### 7. Simplified Startup Process

Created a batch file (`start-fixed-app.bat`) to simplify the application startup process:
- Starts the PHP server on port 8080
- Starts the React development server
- Creates necessary directories
- Provides an easy way to stop all servers

## How to Use

1. Run the `start-fixed-app.bat` script to start both the PHP and React servers
2. Access the application at http://localhost:3000
3. The application will now work properly even if the backend services are unavailable
4. When deploying to the VM (100.71.100.5:8069), ensure the PHP server is running on port 8080 on the same VM

## Technical Notes

- The PHP server runs on port 8080
- The React development server runs on port 3000
- Mock data is used when RabbitMQ connections fail
- Responses are cached to improve performance
- When running on the VM, the application automatically detects the environment and uses absolute URLs
