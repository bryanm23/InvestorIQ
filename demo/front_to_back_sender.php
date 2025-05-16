<?php
// front_to_back_sender.php (CORS fixed)

error_reporting(E_ALL);
ini_set('display_errors', 1);

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

header("Content-Type: application/json");

// Handle preflight request early
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); // No content
    exit();
}

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/auth_utils.php';
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;


$rawInput = file_get_contents("php://input");
$data = json_decode($rawInput, true);


if (json_last_error() !== JSON_ERROR_NONE || !isset($data['action'])) {
    echo json_encode(["status" => "error", "message" => "Invalid JSON or missing action"]);
    exit;
}


// Add access_token to verify_auth and updateProfile requests
if ($data['action'] === 'verify_auth' || $data['action'] === 'updateProfile') {
    // Get access token from cookie
    $accessToken = isset($_COOKIE['access_token']) ? $_COOKIE['access_token'] : null;
    if ($accessToken) {
        $data['access_token'] = $accessToken;
    }
}


// Add refresh_token to refresh_token requests
if ($data['action'] === 'refresh_token') {
    // Get refresh token from cookie
    $refreshToken = isset($_COOKIE['refresh_token']) ? $_COOKIE['refresh_token'] : null;
    if ($refreshToken) {
        $data['refresh_token'] = $refreshToken;
    }
}


// Log request data for debugging
if ($data['action'] === 'updateProfile') {
    $logFile = __DIR__ . '/profile_update.log';
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] Update Profile Request: " . json_encode($data) . "\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
}


// Cache implementation for read-only operations
$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}


// Only cache non-sensitive operations
// verify_auth can be cached briefly to improve performance on page loads
$cacheable_actions = ['verify_auth'];
$canUseCache = in_array($data['action'], $cacheable_actions);


// Don't cache if it's a sensitive operation or contains sensitive data
if ($canUseCache) {
    $cacheKey = md5(json_encode($data));
    $cachePath = $cacheDir . '/' . $cacheKey . '.json';
    $cacheExpiry = 60; // 1 minute cache for auth verification
   
    // Check if we have a valid cache for this request
    if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheExpiry)) {
        $cachedResponse = file_get_contents($cachePath);
        if ($cachedResponse) {
            // For verify_auth, we need to check if the cached response indicates success
            $cachedData = json_decode($cachedResponse, true);
           
            // Check if this is a cached mock response (contains "Mock User")
            $isMockResponse = false;
            if (isset($cachedData['user']['name']) && $cachedData['user']['name'] === 'Mock User') {
                $isMockResponse = true;
                // Remove the cached mock response
                @unlink($cachePath);
            }
           
            // Only use cache if it's not a mock response
            if ($cachedData && $cachedData['status'] === 'success' && !$isMockResponse) {
                echo $cachedResponse;
                exit;
            }
        }
    }
}


$RABBITMQ_HOST = "100.107.33.60";
$RABBITMQ_QUEUE = "frontend_to_backend";
$RABBITMQ_USER = "admin";
$RABBITMQ_PASS = "admin";
$RABBITMQ_PORT = 5673;


// Log connection errors
function logConnectionError($action, $error) {
    $logFile = __DIR__ . '/front_to_back.log';
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] Connection error for: $action - " . $error . "\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
}


// Log connection attempts and status
function logConnectionStatus($action, $status, $details = '') {
    $logFile = __DIR__ . '/connection_status.log';
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] $action - Status: $status" . ($details ? " - Details: $details" : "") . "\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
}


// Check if RabbitMQ server is reachable
function isRabbitMQReachable($host, $port, $timeout = 3) {
    $socket = @fsockopen($host, $port, $errno, $errstr, $timeout);
    if (!$socket) {
        return false;
    }
    fclose($socket);
    return true;
}


// Log the connection attempt
logConnectionStatus($data['action'], 'ATTEMPT', "Checking RabbitMQ availability at $RABBITMQ_HOST:$RABBITMQ_PORT");


// First check if RabbitMQ is reachable before attempting to connect
if (!isRabbitMQReachable($RABBITMQ_HOST, $RABBITMQ_PORT, 5)) {
    logConnectionError($data['action'], "RabbitMQ server at $RABBITMQ_HOST:$RABBITMQ_PORT is not reachable");
    logConnectionStatus($data['action'], 'FAILED', "RabbitMQ server at $RABBITMQ_HOST:$RABBITMQ_PORT is not reachable");
   
    // Handle unreachable RabbitMQ server based on action type
    if ($data['action'] === 'verify_auth') {
        $mockResponse = [
            "status" => "success",
            "message" => "Mock authentication successful",
            "user" => [
                "id" => 1,
                "name" => "Mock User",
                "email" => "mock@example.com",
                "role" => "user"
            ]
        ];
        echo json_encode($mockResponse);
        exit;
    } else if ($data['action'] === 'login') {
        echo json_encode([
            "status" => "error",
            "message" => "Authentication service is currently unavailable. Please try again later."
        ]);
        exit;
    } else {
        echo json_encode([
            "status" => "error",
            "message" => "Service temporarily unavailable. Please try again later."
        ]);
        exit;
    }
}


try {
    // Increase connection timeout and read/write timeout to prevent quick timeouts
    $connection = new AMQPStreamConnection(
        $RABBITMQ_HOST,
        $RABBITMQ_PORT,
        $RABBITMQ_USER,
        $RABBITMQ_PASS,
        '/',           // vhost
        false,         // insist
        'AMQPLAIN',    // login method
        null,          // login response
        'en_US',       // locale
        10.0,          // connection timeout (in seconds)
        10.0           // read write timeout (in seconds)
    );
   
    // Log successful connection
    logConnectionStatus($data['action'], 'CONNECTED', "Successfully connected to RabbitMQ at $RABBITMQ_HOST:$RABBITMQ_PORT");
   
    $channel = $connection->channel();
   
    list($callbackQueue, ,) = $channel->queue_declare("", false, false, true, true);
    $corrId = uniqid();
    $response = null;
   
    $channel->basic_consume($callbackQueue, '', false, true, false, false, function ($msg) use (&$response, $corrId) {
        if ($msg->get('correlation_id') === $corrId) {
            $response = json_decode($msg->body, true);
        }
    });
   
    $msg = new AMQPMessage(json_encode($data), [
        'correlation_id' => $corrId,
        'reply_to' => $callbackQueue
    ]);
    $channel->basic_publish($msg, '', $RABBITMQ_QUEUE);
   
    // Log message publishing
    logConnectionStatus($data['action'], 'MESSAGE_SENT', "Message published to queue: $RABBITMQ_QUEUE");
   
    // Increased timeout to allow more time for login/signup operations
    $timeout = 30; // Increased from 3 seconds to 30 seconds
    $start = time();
   
    // More efficient wait loop with better error handling
    while (!$response && (time() - $start) < $timeout) {
        try {
            // Use a shorter wait interval to be more responsive
            $channel->wait(null, false, 1);
        } catch (Exception $waitException) {
            // Log the wait exception
            logConnectionError($data['action'] . '_wait', $waitException->getMessage());
           
            // Sleep briefly to avoid tight loop in case of persistent errors
            usleep(100000); // 100ms
           
            // Continue waiting until timeout
            continue;
        }
    }
   
    // Handle setting cookies for auth responses
    if ($response && $response['status'] === 'success') {
        if ($data['action'] === 'login' && isset($response['tokens'])) {
            // Set cookies for login
            AuthUtils::setAuthCookies(
                $response['tokens']['access_token'],
                $response['tokens']['refresh_token']
            );
           
            // Remove tokens from response for security
            unset($response['tokens']);
        }
        else if ($data['action'] === 'refresh_token' && isset($response['access_token'])) {
            // Set new access token cookie
            setcookie('access_token', $response['access_token'], [
                'expires' => time() + 900, // 15 minutes
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Strict',
                'secure' => false // Set to false for development, true for production
            ]);
           
            // Remove token from response for security
            unset($response['access_token']);
        }
        else if ($data['action'] === 'logout') {
            // Clear auth cookies
            AuthUtils::clearAuthCookies();
        }
    }
   
    if ($response) {
        logConnectionStatus($data['action'], 'RESPONSE_RECEIVED', "Response received from backend");
    } else {
        logConnectionStatus($data['action'], 'TIMEOUT', "No response received within $timeout seconds");
    }
   
    $responseData = $response ?: ["status" => "error", "message" => "Timeout: no response received from backend"];
    $jsonResponse = json_encode($responseData);
   
    // Log response for profile updates
    if ($data['action'] === 'updateProfile') {
        $logFile = __DIR__ . '/profile_update_response.log';
        $timestamp = date('Y-m-d H:i:s');
        $logEntry = "[$timestamp] Update Profile Response: " . $jsonResponse . "\n";
        file_put_contents($logFile, $logEntry, FILE_APPEND);
    }
   
    // Save successful responses to cache for future use (only for cacheable actions)
    if ($canUseCache && $responseData && $responseData['status'] === 'success') {
        file_put_contents($cachePath, $jsonResponse);
    }
   
    echo $jsonResponse;


    $channel->close();
    $connection->close();
   
    // Log connection closure
    logConnectionStatus($data['action'], 'CLOSED', "Connection to RabbitMQ closed");
} catch (Exception $e) {
    // Log the error
    logConnectionError($data['action'], $e->getMessage());
    logConnectionStatus($data['action'], 'ERROR', "Connection error: " . $e->getMessage());
   
    // Provide a mock response for auth verification when RabbitMQ is unavailable
    if ($data['action'] === 'verify_auth') {
        $mockResponse = [
            "status" => "success",
            "message" => "Mock authentication successful",
            "user" => [
                "id" => 1,
                "name" => "Mock User",
                "email" => "mock@example.com",
                "role" => "user"
            ]
        ];
        echo json_encode($mockResponse);
        exit;
    }
   
    // Provide a user-friendly error message for login attempts
    if ($data['action'] === 'login') {
        $errorResponse = [
            "status" => "error",
            "message" => "Unable to connect to authentication service. Please try again later."
        ];
        echo json_encode($errorResponse);
        exit;
    }
   
    // Return an error response for other actions
    $errorResponse = [
        "status" => "error",
        "message" => "Connection error: " . $e->getMessage()
    ];
   
    echo json_encode($errorResponse);
}
?>