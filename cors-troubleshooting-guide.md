# CORS Troubleshooting Guide

## Issue: CORS Error with Credentialed Requests

When running the PHP server on port 8000, the application encounters CORS (Cross-Origin Resource Sharing) errors when making credentialed requests from the frontend to the backend. The specific error is:

```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://100.71.100.5:8000/front_to_back_sender.php. (Reason: Credential is not supported if the CORS header 'Access-Control-Allow-Origin' is '*').
```

## Why This Happens

This error occurs due to a fundamental security restriction in CORS:

1. When making credentialed requests (requests with cookies, HTTP authentication, or client-side certificates), the server **must** respond with a specific origin in the `Access-Control-Allow-Origin` header.
2. Using a wildcard (`*`) for `Access-Control-Allow-Origin` is not allowed with credentialed requests.

In our application:
- The frontend (React) is making requests with `withCredentials: true` in the AuthContext.js file
- The backend (PHP) needs to respond with the correct CORS headers

## The Fix Implemented

A minimal fix has been applied to `demo/front_to_back_sender.php` that:

1. Adds logging to track the origin being received
2. Simplifies the CORS header logic
3. Ensures headers are set before any potential output
4. Sets a specific origin (http://100.71.100.5:8069) as the default when the origin isn't in the allowed list

```php
// Debug: Log the origin to a file
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'none';
file_put_contents(__DIR__ . '/cors_debug.log', date('Y-m-d H:i:s') . " - Origin: $origin\n", FILE_APPEND);

// Define trusted frontend origins
$allowedOrigins = [
    'http://localhost:3000',
    'http://100.71.100.5:8069',
    'http://100.71.100.5:8000',
    'http://localhost:8000'
];

// MINIMAL FIX: Always set the origin to the requesting origin if it's in our allowed list
// or to a specific allowed origin if not
if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    // When using credentials, we can't use '*' so we'll use the first allowed origin
    header("Access-Control-Allow-Origin: http://100.71.100.5:8069");
}

// Set the rest of the CORS headers
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400"); // Cache preflight for 24 hours
```

## How to Revert the Changes

If you need to revert these changes, simply:

1. Remove the debug logging line:
   ```php
   // Debug: Log the origin to a file
   $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : 'none';
   file_put_contents(__DIR__ . '/cors_debug.log', date('Y-m-d H:i:s') . " - Origin: $origin\n", FILE_APPEND);
   ```

2. Restore the original CORS header logic:
   ```php
   // Get the origin of the request
   $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

   // Set CORS headers
   if (in_array($origin, $allowedOrigins)) {
       // Allow the specific origin that made the request
       header("Access-Control-Allow-Origin: $origin");
       header("Access-Control-Allow-Credentials: true");
       header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
       header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
       header("Access-Control-Max-Age: 86400"); // Cache preflight for 24 hours
   } else {
       // If origin is not in the allowed list, set a default
       // Note: When using credentials, we can't use '*' so we'll use the first allowed origin
       header("Access-Control-Allow-Origin: http://localhost:3000");
       header("Access-Control-Allow-Credentials: true");
       header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
       header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
   }
   ```

## CORS Best Practices with Credentialed Requests

When working with credentialed requests across origins:

1. **Never use wildcards with credentials**:
   - `Access-Control-Allow-Origin: *` is not allowed with `withCredentials: true`
   - Always specify the exact origin

2. **Set appropriate headers**:
   - `Access-Control-Allow-Credentials: true` must be set
   - `Access-Control-Allow-Methods` should list all allowed methods
   - `Access-Control-Allow-Headers` should include all required headers

3. **Handle preflight requests**:
   - OPTIONS requests must be handled correctly
   - Respond with appropriate status code (usually 204 No Content)

4. **Set headers before any output**:
   - PHP headers must be sent before any content
   - Check for whitespace or output before header() calls

5. **Debug with logging**:
   - Log the received origin and sent headers
   - Check browser developer tools for CORS errors

## Troubleshooting Additional CORS Issues

If you encounter other CORS issues:

1. Check the browser console for specific error messages
2. Verify the origin being sent in requests matches what's in your allowed list
3. Ensure headers are being set correctly (check the cors_debug.log file)
4. Test with a simple OPTIONS request to verify preflight handling
5. Consider using browser extensions like CORS Everywhere for testing (but never in production)
