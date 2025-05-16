<?php
require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

// Set content type for response
header("Content-Type: application/json");

// Set the allowed origin dynamically based on the request origin
$allowedOrigins = [
    'http://localhost:3000',
    'http://100.71.100.5:8069',
    'http://100.71.100.5:8000'  // Added PHP server port on VM
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

header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Credentials: true");

// Check for preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Create log file
$logFile = __DIR__ . '/rentcast_sender.log';
function logMessage($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] $message\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
}

// Get input from request
$rawInput = file_get_contents("php://input");
// Only log the action, not the entire payload (which could be large)
$payload = json_decode($rawInput, true);
if ($payload && isset($payload['action'])) {
    logMessage("📥 Received request with action: " . $payload['action']);
} else {
    logMessage("📥 Received invalid request");
}

// Validate input
if (!$payload || !isset($payload['action'])) {
    sendResponse(["status" => "error", "message" => "Missing action or invalid JSON"]);
    exit;
}

// Cache implementation for read operations
$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}

// Determine if this request can be cached
// Only cache GET/search operations, not mutations
$readOnlyActions = ['getProperties', 'searchProperties', 'getPropertyDetails', 'getMarketStats'];
$canUseCache = in_array($payload['action'], $readOnlyActions);

// For cacheable requests, check if we have a valid cache
if ($canUseCache) {
    // Create a unique cache key based on the entire request
    $cacheKey = md5($rawInput);
    $cachePath = $cacheDir . '/' . $cacheKey . '.json';
    
    // Cache expiry depends on the type of data
    // Market stats can be cached longer than property searches
    $cacheExpiry = ($payload['action'] === 'getMarketStats') ? 3600 : 300; // 1 hour or 5 minutes
    
    // Check if we have a valid cache for this request
    if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheExpiry)) {
        $cachedResponse = file_get_contents($cachePath);
        if ($cachedResponse) {
            logMessage("✅ Serving cached response for: " . $payload['action']);
            echo $cachedResponse;
            exit;
        }
    }
}

// RabbitMQ configuration
$rabbitConfig = [
    'host' => '100.107.33.60',
    'port' => 5673,
    'user' => 'admin',
    'pass' => 'admin',
    'queue' => 'rentcast_queue'  // Use the dedicated rentcast queue
];

// If we can't connect to RabbitMQ, return a mock response for development
function getMockResponse($action) {
    logMessage("⚠️ Using mock response for: " . $action);
    
    switch ($action) {
        case 'searchProperties':
            return [
                "status" => "success",
                "message" => "Mock search results",
                "data" => [
                    "properties" => [
                        [
                            "id" => "mock-1",
                            "address" => "123 Mock Street",
                            "city" => "Mockville",
                            "state" => "CA",
                            "price" => 350000,
                            "bedrooms" => 3,
                            "bathrooms" => 2
                        ],
                        [
                            "id" => "mock-2",
                            "address" => "456 Test Avenue",
                            "city" => "Testtown",
                            "state" => "NY",
                            "price" => 425000,
                            "bedrooms" => 4,
                            "bathrooms" => 2.5
                        ]
                    ],
                    "total" => 2
                ]
            ];
        case 'getMarketStats':
            return [
                "status" => "success",
                "message" => "Mock market statistics",
                "data" => [
                    "averagePrice" => 387500,
                    "medianPrice" => 387500,
                    "inventory" => 42,
                    "daysOnMarket" => 28,
                    "pricePerSqFt" => 275
                ]
            ];
        default:
            return [
                "status" => "success",
                "message" => "Mock response for " . $action,
                "data" => []
            ];
    }
}

try {
    // Connect to RabbitMQ
    logMessage("🔌 Connecting to RabbitMQ at {$rabbitConfig['host']}:{$rabbitConfig['port']}...");
    $connection = new AMQPStreamConnection(
        $rabbitConfig['host'],
        $rabbitConfig['port'],
        $rabbitConfig['user'],
        $rabbitConfig['pass'],
        '/',               // vhost
        false,             // insist
        'AMQPLAIN',        // login method
        null,              // login response
        'en_US',           // locale
        10.0,              // connection timeout - increased from 3.0 to 10.0 seconds
        60.0               // read_write_timeout - 60 seconds
    );
    $channel = $connection->channel();

    // Ensure queue exists
    $channel->queue_declare($rabbitConfig['queue'], false, true, false, false);
    
    // Create unique reply queue for this request
    $replyQueue = 'rentcast_reply_' . uniqid();
    $channel->queue_declare($replyQueue, false, false, true, true);
    
    // Generate correlation ID
    $correlationId = uniqid();
    logMessage("🔑 Using correlation ID: $correlationId");
    
    // Create message with correlation ID and reply queue
    $message = new AMQPMessage(json_encode($payload), [
        'correlation_id' => $correlationId,
        'reply_to' => $replyQueue
    ]);
    
    // Publish message to queue
    logMessage("📤 Publishing message to queue: {$rabbitConfig['queue']}");
    $channel->basic_publish($message, '', $rabbitConfig['queue']);
    
    // Variable to store response
    $response = null;
    
    // Define callback for replies
    $callback = function ($msg) use (&$response, $correlationId) {
        logMessage("📥 Received reply with correlation ID: " . $msg->get('correlation_id'));
        
        if ($msg->get('correlation_id') === $correlationId) {
            $response = json_decode($msg->body, true);
            logMessage("✅ Response matched our correlation ID");
        }
    };
    
    // Start consuming from reply queue
    $channel->basic_consume($replyQueue, '', false, true, false, false, $callback);
    
    // Wait for response with increased timeout
    $timeout = 30; // seconds (increased from 10 to 30)
    $start = time();
    
    logMessage("⏱️ Waiting for response (timeout: {$timeout}s)");
    while (!$response && (time() - $start) < $timeout) {
        try {
            $channel->wait(null, false, 1);
        } catch (Exception $e) {
            // Ignore timeout exceptions and continue waiting
            if (strpos($e->getMessage(), 'timeout') === false) {
                throw $e;
            }
        }
    }
    
    // Delete the temporary reply queue
    $channel->queue_delete($replyQueue);
    
    // Close connections
    $channel->close();
    $connection->close();
    
    // Prepare response
    $responseData = $response ?: [
        "status" => "error", 
        "message" => "No response received from API service. Please try again."
    ];
    
    // Cache successful responses for future use
    if ($canUseCache && $responseData && $responseData['status'] === 'success') {
        $jsonResponse = json_encode($responseData);
        file_put_contents($cachePath, $jsonResponse);
        logMessage("💾 Cached response for: " . $payload['action']);
    }
    
    // Send response
    if ($response) {
        logMessage("✅ Sending response to client for: " . $payload['action']);
        sendResponse($responseData);
    } else {
        logMessage("⚠️ Response timeout reached for: " . $payload['action']);
        sendResponse($responseData);
    }
    
} catch (Exception $e) {
    $errorMsg = "❌ Error: " . $e->getMessage();
    logMessage($errorMsg);
    
    // For development: return mock data instead of error
    // This allows frontend testing even when backend services are unavailable
    $mockResponse = getMockResponse($payload['action']);
    
    // Cache the mock response too
    if ($canUseCache) {
        $jsonResponse = json_encode($mockResponse);
        file_put_contents($cachePath, $jsonResponse);
        logMessage("💾 Cached mock response for: " . $payload['action']);
    }
    
    sendResponse($mockResponse);
}

/**
 * Send JSON response to client
 */
function sendResponse($data) {
    echo json_encode($data);
}
