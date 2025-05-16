<?php
require_once __DIR__ . '/vendor/autoload.php'; // PhpAmqpLib via Composer

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

// Configuration
$RABBITMQ_HOST = '100.107.33.60';
$RABBITMQ_PORT = 5673;
$RABBITMQ_USER = 'admin';
$RABBITMQ_PASS = 'admin';
$RENTCAST_API_KEY = '3d587c5223604e4b874588109b9aea47';
$GOOGLE_MAPS_API_KEY = 'AIzaSyCB9ZQm7xpe7AFDM9eYa8m0ZQjOVL2U6gQ';
$RENTCAST_QUEUE = 'rentcast_queue'; // Dedicated queue for RentCast

// Create log file
$logFile = __DIR__ . '/rentcast_receiver.log';
function logMessage($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] $message\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
    // Also echo to console
    echo "[$timestamp] $message\n";
}

try {
    // Connect to RabbitMQ
    logMessage("🔄 Connecting to RabbitMQ at $RABBITMQ_HOST:$RABBITMQ_PORT...");
    $connection = new AMQPStreamConnection($RABBITMQ_HOST, $RABBITMQ_PORT, $RABBITMQ_USER, $RABBITMQ_PASS);
    $channel = $connection->channel();

    // Declare dedicated queue for RentCast
    $channel->queue_declare($RENTCAST_QUEUE, false, true, false, false);

    logMessage("✅ RentCast Receiver: Listening on dedicated queue: $RENTCAST_QUEUE");

    $channel->basic_consume($RENTCAST_QUEUE, '', false, true, false, false, function ($msg) use ($channel, $RENTCAST_API_KEY, $GOOGLE_MAPS_API_KEY) {
        $data = json_decode($msg->body, true);
        $replyTo = $msg->get('reply_to');
        $correlationId = $msg->get('correlation_id');
        
        if (!isset($data['action'])) {
            logMessage("❌ Error: Invalid message format - missing action");
            return;
        }
        
        $action = $data['action'];
        $params = $data['params'] ?? [];

        logMessage("📩 Received message: " . json_encode($data));

        $response = ['status' => 'error', 'message' => 'Invalid action'];

        try {
            // Handle RentCast API requests
            if (strpos($action, 'rentcast_') === 0) {
                $subAction = str_replace('rentcast_', '', $action);
                logMessage("🔧 Processing RentCast action: $subAction");
                
                switch ($subAction) {
                    case 'search':
                        // Check parameters
                        logMessage("Checking search parameters: " . json_encode($params));
                        
                        // Clean parameters
                        $cleanedParams = cleanParams($params);
                        $queryString = http_build_query($cleanedParams);
                        
                        // Use the correct endpoint based on previous testing
                        $url = 'https://api.rentcast.io/v1/properties?' . $queryString;
                        
                        logMessage("🔍 Trying RentCast API URL: $url");
                        logMessage("🔍 Cleaned Parameters: " . json_encode($cleanedParams));
                        
                        $response = fetchRentcast($url, 'GET', $RENTCAST_API_KEY, $cleanedParams);
                        break;

                    case 'getPropertyDetails':
                        if (empty($params['propertyId'])) {
                            throw new Exception("propertyId required");
                        }
                        $url = 'https://api.rentcast.io/v1/properties/' . urlencode($params['propertyId']);
                        logMessage("🔍 API URL: $url");
                        $response = fetchRentcast($url, 'GET', $RENTCAST_API_KEY, $params);
                        break;

                    case 'getRentalEstimate':
                        $url = 'https://api.rentcast.io/v1/rents/estimate';
                        logMessage("🔍 API URL: $url with POST data: " . json_encode($params));
                        $response = fetchRentcast($url, 'POST', $RENTCAST_API_KEY, $params);
                        break;

                    case 'getMarketData':
                        $cleanedParams = cleanParams($params);
                        $queryString = http_build_query($cleanedParams);
                        $url = 'https://api.rentcast.io/v1/markets?' . $queryString;
                        logMessage("🔍 API URL: $url");
                        $response = fetchRentcast($url, 'GET', $RENTCAST_API_KEY, $params);
                        break;

                    default:
                        throw new Exception("Unknown RentCast action: $subAction");
                }
            }
            // Handle Google Maps API requests through same receiver
            else if (strpos($action, 'maps_') === 0 || $action === 'geocode' || $action === 'streetView') {
                logMessage("🔧 Processing Google Maps action: $action");
                
                switch ($action) {
                    case 'geocode':
                    case 'maps_geocode':
                        if (empty($params['address'])) {
                            throw new Exception("address parameter required for geocoding");
                        }
                        
                        $url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' . 
                               urlencode($params['address']) . 
                               '&key=' . $GOOGLE_MAPS_API_KEY;
                        
                        logMessage("🔍 Google Maps Geocoding URL: $url");
                        $response = fetchGoogleMaps($url);
                        break;
                        
                    case 'streetView':
                    case 'maps_streetView':
                        if (empty($params['latitude']) || empty($params['longitude'])) {
                            throw new Exception("latitude and longitude required for Street View");
                        }
                        
                        // Get parameters with defaults
                        $size = $params['size'] ?? '600x300';
                        $fov = $params['fov'] ?? '90';
                        $heading = $params['heading'] ?? '0';
                        $pitch = $params['pitch'] ?? '0';
                        
                        $location = $params['latitude'] . ',' . $params['longitude'];
                        
                        // First check if Street View is available at this location
                        $metadataUrl = 'https://maps.googleapis.com/maps/api/streetview/metadata?location=' . 
                                      $location . '&key=' . $GOOGLE_MAPS_API_KEY;
                        
                        // Check if Street View is available
                        logMessage("🔍 Checking Street View availability: $metadataUrl");
                        $metadataResponse = fetchGoogleMaps($metadataUrl);
                        
                        if ($metadataResponse['status'] === 'OK') {
                            // Street View is available, generate image URL
                            $imageUrl = 'https://maps.googleapis.com/maps/api/streetview?' .
                                       'size=' . $size . 
                                       '&location=' . $location . 
                                       '&fov=' . $fov . 
                                       '&heading=' . $heading .
                                       '&pitch=' . $pitch .
                                       '&key=' . $GOOGLE_MAPS_API_KEY;
                            
                            // Log the complete URL for debugging
                            logMessage("✅ Street View available, generating URL: $imageUrl");
                            
                            $response = [
                                'status' => 'success',
                                'data' => [
                                    'url' => $imageUrl,
                                    'metadata' => $metadataResponse
                                ]
                            ];
                        } else {
                            // No Street View available at this location
                            logMessage("❌ No Street View available at location: $location. Status: " . $metadataResponse['status']);
                            
                            $response = [
                                'status' => 'error',
                                'message' => 'No Street View available for this location',
                                'metadata' => $metadataResponse
                            ];
                        }
                        break;
                        
                    default:
                        throw new Exception("Unknown Google Maps action: $action");
                }
            } else {
                throw new Exception("Unsupported action: $action");
            }
            
            logMessage("✅ API request successful");
        } catch (Exception $e) {
            $errorMsg = "❌ Error processing action: " . $e->getMessage();
            logMessage($errorMsg);
            $response = ['status' => 'error', 'message' => $e->getMessage()];
        }

        // Send reply if replyTo and correlationId are provided
        if ($replyTo && $correlationId) {
            $responseMessage = new AMQPMessage(json_encode($response), [
                'correlation_id' => $correlationId
            ]);
            $channel->basic_publish($responseMessage, '', $replyTo);
            logMessage("📤 Sent response to $replyTo [correlation_id=$correlationId]");
        }
    });

    echo "🔄 Waiting for messages on $RENTCAST_QUEUE. To exit press CTRL+C\n";
    while ($channel->is_consuming()) {
        $channel->wait();
    }

    $channel->close();
    $connection->close();
} catch (Exception $e) {
    $errorMsg = "🔥 Fatal error: " . $e->getMessage();
    logMessage($errorMsg);
}

// Helper functions

/**
 * Make API request to RentCast
 */
function fetchRentcast(string $url, string $method, string $apiKey, array $params = []): array {
    logMessage("🌐 Calling RentCast API: $url");
    
    $ch = curl_init();
    
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For development only
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // For development only
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Api-Key: ' . $apiKey
    ]);
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($params));
        logMessage("📝 POST data: " . json_encode($params));
    }
    
    $apiResponse = curl_exec($ch);
    $apiResponseCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    logMessage("🔍 HTTP Response Code: $apiResponseCode");
    
    if (curl_errno($ch)) {
        $curlError = curl_error($ch);
        logMessage("❌ cURL Error: " . $curlError);
        curl_close($ch);
        throw new Exception("API connection error: " . $curlError);
    }
    
    curl_close($ch);
    
    if ($apiResponseCode >= 400) {
        // Try to decode error response for more info
        $errorData = json_decode($apiResponse, true);
        
        // Create a more user-friendly error message
        if ($apiResponseCode == 404) {
            $searchParams = '';
            if (!empty($params['address'])) {
                $searchParams = "address '" . $params['address'] . "'";
            } elseif (!empty($params['zipCode'])) {
                $searchParams = "zipCode '" . $params['zipCode'] . "'";
            }
            
            $errorMessage = "No data found" . ($searchParams ? " for $searchParams" : "");
        } else {
            $errorMessage = isset($errorData['message']) ? $errorData['message'] : "HTTP $apiResponseCode";
        }
        
        logMessage("❌ API returned error: $errorMessage");
        throw new Exception("RentCast API error: HTTP $apiResponseCode - $errorMessage");
    }
    
    // Attempt to decode the response
    $apiResponseData = json_decode($apiResponse, true);
    
    // Check if the response is valid JSON
    if ($apiResponse && json_last_error() !== JSON_ERROR_NONE) {
        logMessage("⚠️ Warning: API returned non-JSON response");
        return ['status' => 'success', 'data' => $apiResponse];
    }
    
    return ['status' => 'success', 'data' => $apiResponseData];
}

/**
 * Make API request to Google Maps
 */
function fetchGoogleMaps(string $url): array {
    logMessage("🌐 Calling Google Maps API: $url");
    
    $ch = curl_init();
    
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For development only
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false); // For development only
    
    $apiResponse = curl_exec($ch);
    $apiResponseCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    logMessage("🔍 HTTP Response Code: $apiResponseCode");
    
    if (curl_errno($ch)) {
        $curlError = curl_error($ch);
        logMessage("❌ cURL Error: " . $curlError);
        curl_close($ch);
        throw new Exception("API connection error: " . $curlError);
    }
    
    curl_close($ch);
    
    if ($apiResponseCode >= 400) {
        logMessage("❌ API returned error status: $apiResponseCode");
        logMessage("Response body: $apiResponse");
        throw new Exception("Google Maps API error: HTTP $apiResponseCode");
    }
    
    // Attempt to decode the response
    $apiResponseData = json_decode($apiResponse, true);
    
    // Check if the response is valid JSON
    if ($apiResponse && json_last_error() !== JSON_ERROR_NONE) {
        logMessage("⚠️ Warning: API returned non-JSON response");
        return ['status' => 'error', 'message' => 'Invalid JSON response from Google Maps API'];
    }
    
    return $apiResponseData;
}

/**
 * Clean empty params from request
 */
function cleanParams(array $params): array {
    $cleaned = array_filter($params, function($value) {
        return $value !== null && $value !== '';
    });
    
    // Log what was cleaned
    logMessage("🧹 Cleaned parameters. Before: " . json_encode($params) . ", After: " . json_encode($cleaned));
    
    return $cleaned;
}