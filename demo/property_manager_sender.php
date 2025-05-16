<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Always set content type to JSON
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

// Create log file for debugging
$logFile = __DIR__ . '/property_manager.log';
function logMessage($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] $message\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
}

logMessage("Request received: " . $_SERVER['REQUEST_METHOD']);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/vendor/autoload.php';
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

try {
    $rawInput = file_get_contents("php://input");
    logMessage("Raw input: " . $rawInput);
    
    $data = json_decode($rawInput, true);

    if (json_last_error() !== JSON_ERROR_NONE || !isset($data['action'])) {
        logMessage("Error: Invalid JSON or missing action");
        echo json_encode(["status" => "error", "message" => "Invalid JSON or missing action"]);
        exit;
    }
    
    logMessage("Processing action: " . $data['action']);
} catch (Exception $e) {
    logMessage("Error in request processing: " . $e->getMessage());
    echo json_encode(["status" => "error", "message" => "Error processing request: " . $e->getMessage()]);
    exit;
}

// Cache implementation for read operations
try {
    $cacheDir = __DIR__ . '/cache';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
        logMessage("Created cache directory: " . $cacheDir);
    }

    // Only cache GET operations (getSavedProperties)
    $canUseCache = ($data['action'] === 'getSavedProperties');
    $cacheKey = md5(json_encode($data));
    $cachePath = $cacheDir . '/' . $cacheKey . '.json';
    $cacheExpiry = 300; // 5 minutes

    // Check if we have a valid cache for this request
    if ($canUseCache && file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheExpiry)) {
        logMessage("Using cached response for: " . $data['action']);
        $cachedResponse = file_get_contents($cachePath);
        if ($cachedResponse) {
            echo $cachedResponse;
            exit;
        }
    }
} catch (Exception $e) {
    logMessage("Cache error: " . $e->getMessage());
    // Continue execution even if caching fails
}

$RABBITMQ_HOST = "100.107.33.60";
$RABBITMQ_QUEUE = "property_management"; // Use the dedicated queue
$RABBITMQ_USER = "admin";
$RABBITMQ_PASS = "admin";
$RABBITMQ_PORT = 5673;

try {
    logMessage("Connecting to RabbitMQ at $RABBITMQ_HOST:$RABBITMQ_PORT...");
    
    $connection = new AMQPStreamConnection(
        $RABBITMQ_HOST, 
        $RABBITMQ_PORT, 
        $RABBITMQ_USER, 
        $RABBITMQ_PASS,
        '/',               // vhost
        false,             // insist
        'AMQPLAIN',        // login method
        null,              // login response
        'en_US',           // locale
        10.0,              // connection timeout - increased from 3.0 to 10.0 seconds
        60.0               // read_write_timeout - 60 seconds
    );
    
    $channel = $connection->channel();
    logMessage("Connected to RabbitMQ successfully");
    
    // Ensure the queue exists
    $channel->queue_declare($RABBITMQ_QUEUE, false, true, false, false);
    logMessage("Queue declared: $RABBITMQ_QUEUE");
    
    // Create unique reply queue for this request
    $replyQueue = 'property_reply_' . uniqid();
    list($callbackQueue, ,) = $channel->queue_declare($replyQueue, false, false, true, true);
    logMessage("Reply queue created: $callbackQueue");
    
    $corrId = uniqid();
    logMessage("Correlation ID: $corrId");
    $response = null;
    
$channel->basic_consume($callbackQueue, '', false, true, false, false, function ($msg) use (&$response, $corrId) {
        logMessage("Received response with correlation ID: " . $msg->get('correlation_id'));
        if ($msg->get('correlation_id') === $corrId) {
            $response = json_decode($msg->body, true);
            logMessage("Response matched our correlation ID");
        }
    });
    
    $msg = new AMQPMessage(json_encode($data), [
        'correlation_id' => $corrId,
        'reply_to' => $callbackQueue
    ]);
    
    logMessage("Publishing message to queue: $RABBITMQ_QUEUE");
    $channel->basic_publish($msg, '', $RABBITMQ_QUEUE);
    
    // Increased timeout for more reliable response
    $timeout = 30; // Increased from 5 seconds to 30 seconds
    $start = time();
    
    logMessage("Waiting for response (timeout: {$timeout}s)");
    // More efficient wait loop with shorter wait intervals
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
    
    $responseData = $response ?: ["status" => "error", "message" => "Timeout: no response received from backend"];
    $jsonResponse = json_encode($responseData);
    
    logMessage("Response: " . $jsonResponse);
    
    // Save successful responses to cache for future use
    if ($canUseCache && $responseData && $responseData['status'] === 'success') {
        file_put_contents($cachePath, $jsonResponse);
        logMessage("Response cached successfully");
    }
    
    echo $jsonResponse;

    $channel->close();
    $connection->close();
    logMessage("Connection closed");
} catch (Exception $e) {
    $errorMessage = "RabbitMQ error: " . $e->getMessage();
    logMessage("Error: " . $errorMessage);
    echo json_encode(["status" => "error", "message" => $errorMessage]);
}
?>
