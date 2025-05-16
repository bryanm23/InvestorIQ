<?php
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/auth_utils.php';
require_once __DIR__ . '/db_utils.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

$RABBITMQ_HOST = "100.107.33.60";
$RABBITMQ_PORT = 5673;
$RABBITMQ_USER = "admin";
$RABBITMQ_PASS = "admin";
$RABBITMQ_QUEUE = "property_management"; // New dedicated queue

try {
    echo "🔄 Connecting to RabbitMQ at $RABBITMQ_HOST:$RABBITMQ_PORT...\n";
    $connection = new AMQPStreamConnection($RABBITMQ_HOST, $RABBITMQ_PORT, $RABBITMQ_USER, $RABBITMQ_PASS);
    $channel = $connection->channel();

    // Declare a new queue for property management
    $channel->queue_declare($RABBITMQ_QUEUE, false, true, false, false);
    echo "✅ Connected to RabbitMQ. Waiting for property management messages...\n";

    $callback = function ($msg) {
        echo "⚠️ Callback triggered. Attempting to process property management message...\n";

        $data = json_decode($msg->body, true);
        echo "📩 Received Message: " . json_encode($data) . "\n";
        
        $channel = $msg->getChannel();
        $replyTo = $msg->get('reply_to');
        $corrId = $msg->get('correlation_id');

        if (!$data || !isset($data['action'])) {
            echo "❌ Error: Invalid request data received\n";
            sendReply($channel, $replyTo, $corrId, ["status" => "error", "message" => "Invalid request"]);
            return;
        }

        try {
            echo "🔧 Processing property action: " . $data['action'] . "\n";
            
            $response = ["status" => "error", "message" => "Unknown action"];
            
            switch($data['action']) {
                case 'saveProperty':
                    $response = handleSaveProperty($data);
                    break;
                    
                case 'getSavedProperties':
                    $response = handleGetSavedProperties($data);
                    break;
                    
                case 'deleteSavedProperty':
                    $response = handleDeleteSavedProperty($data);
                    break;
                    
                default:
                    $response = ["status" => "error", "message" => "Unknown property action: " . $data['action']];
                    break;
            }
            
            if ($replyTo && $corrId) {
                sendReply($channel, $replyTo, $corrId, $response);
            }
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            sendReply($channel, $replyTo, $corrId, ["status" => "error", "message" => "Server error: " . $e->getMessage()]);
        }
    };

    function sendReply($channel, $replyTo, $corrId, $response) {
        if ($replyTo && $corrId) {
            $replyMsg = new AMQPMessage(json_encode($response), [
                'correlation_id' => $corrId
            ]);
            $channel->basic_publish($replyMsg, '', $replyTo);
            echo "📤 Replied to $replyTo with correlation_id $corrId\n";
        }
    }

    // Handle saving a property
    function handleSaveProperty($data) {
        if (!isset($data['user_id'], $data['property_id'], $data['address'])) {
            return ["status" => "error", "message" => "Missing required fields"];
        }
        
        // Ensure user_id is an integer
        $userId = intval($data['user_id']);
        $propertyId = $data['property_id'];
        $address = $data['address'];
        $price = $data['price'] ?? null;
        $bedrooms = $data['bedrooms'] ?? null;
        $bathrooms = $data['bathrooms'] ?? null;
        $sqft = $data['sqft'] ?? null;
        $propertyType = $data['property_type'] ?? null;
        $imageUrl = $data['image_url'] ?? null;
        
        try {
            $pdo = getPDO();
            
            // Check if property already saved
            $stmt = $pdo->prepare("SELECT id FROM saved_properties WHERE user_id = ? AND property_id = ?");
            $stmt->execute([$userId, $propertyId]);
            
            if ($stmt->fetch()) {
                return ["status" => "error", "message" => "Property already saved"];
            }
            
            // Save the property
            $stmt = $pdo->prepare(
                "INSERT INTO saved_properties 
                (user_id, property_id, address, price, bedrooms, bathrooms, sqft, property_type, image_url) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            
            $stmt->execute([
                $userId, 
                $propertyId, 
                $address, 
                $price, 
                $bedrooms, 
                $bathrooms, 
                $sqft, 
                $propertyType, 
                $imageUrl
            ]);
            
            echo "✅ Property saved for user ID: $userId\n";
            
            return [
                "status" => "success",
                "message" => "Property saved successfully",
                "property_id" => $propertyId
            ];
            
        } catch (Exception $e) {
            echo "❌ Error saving property: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Database error: " . $e->getMessage()];
        }
    }

    // Handle retrieving saved properties
    function handleGetSavedProperties($data) {
        if (!isset($data['user_id'])) {
            return ["status" => "error", "message" => "Missing user ID"];
        }
        
        // Ensure user_id is an integer
        $userId = intval($data['user_id']);
        
        try {
            $pdo = getPDO();
            
            $stmt = $pdo->prepare(
                "SELECT * FROM saved_properties 
                WHERE user_id = ? 
                ORDER BY created_at DESC"
            );
            
            $stmt->execute([$userId]);
            $properties = $stmt->fetchAll();
            
            echo "✅ Retrieved " . count($properties) . " saved properties for user ID: $userId\n";
            
            return [
                "status" => "success",
                "properties" => $properties
            ];
            
        } catch (Exception $e) {
            echo "❌ Error retrieving saved properties: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Database error: " . $e->getMessage()];
        }
    }

    // Handle deleting a saved property
    function handleDeleteSavedProperty($data) {
        if (!isset($data['user_id'], $data['property_id'])) {
            return ["status" => "error", "message" => "Missing required fields"];
        }
        
        // Ensure user_id is an integer
        $userId = intval($data['user_id']);
        $propertyId = $data['property_id'];
        
        try {
            $pdo = getPDO();
            
            $stmt = $pdo->prepare("DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?");
            $result = $stmt->execute([$userId, $propertyId]);
            
            if ($stmt->rowCount() > 0) {
                echo "✅ Property deleted for user ID: $userId\n";
                return [
                    "status" => "success",
                    "message" => "Property removed from saved list"
                ];
            } else {
                return [
                    "status" => "error",
                    "message" => "Property not found in saved list"
                ];
            }
            
        } catch (Exception $e) {
            echo "❌ Error deleting saved property: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Database error: " . $e->getMessage()];
        }
    }

    // Helper function to get PDO connection
    function getPDO() {
        $DB_HOST = '100.82.47.115';  // HAProxy
        $DB_PORT = 3307;             // HAProxy port
        $DB_NAME = "real_estate";
        $DB_USER = "root";
        $DB_PASS = "admin";
        $DB_TIMEOUT = 5;
    
        try {
            $pdo = new PDO(
                "mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8",
                $DB_USER,
                $DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => $DB_TIMEOUT
                ]
            );
            echo "✅ Connected to MySQL via HAProxy at $DB_HOST:$DB_PORT\n";
            return $pdo;
        } catch (PDOException $e) {
            echo "❌ DB connection failed: " . $e->getMessage() . "\n";
            throw new Exception("Failed to connect to database");
        }
    }
    

    $channel->basic_consume($RABBITMQ_QUEUE, '', false, true, false, false, $callback);

    while ($channel->is_consuming()) {
        $channel->wait();
    }

    $channel->close();
    $connection->close();

} catch (Exception $e) {
    echo "❌ " . $e->getMessage() . "\n";
}
?>
