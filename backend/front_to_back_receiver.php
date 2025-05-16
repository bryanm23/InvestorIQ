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
$RABBITMQ_QUEUE = "frontend_to_backend"; 

try {
    echo "🔄 Connecting to RabbitMQ at $RABBITMQ_HOST:$RABBITMQ_PORT...\n";
    $connection = new AMQPStreamConnection($RABBITMQ_HOST, $RABBITMQ_PORT, $RABBITMQ_USER, $RABBITMQ_PASS);
    $channel = $connection->channel();

    $channel->queue_declare($RABBITMQ_QUEUE, false, true, false, false);
    echo "✅ Connected to RabbitMQ. Waiting for messages...\n";

    $callback = function ($msg) {
        echo "⚠️ Callback triggered. Attempting to process message...\n";

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
            echo "🔧 Processing action: " . $data['action'] . "\n";
            
            $response = ["status" => "error", "message" => "Unknown action"];
            
            switch($data['action']) {
                case 'signup':
                    $response = handleSignup($data);
                    break;
                    
                case 'login':
                    $response = handleLogin($data);
                    break;
                    
                case 'refresh_token':
                    $response = handleRefreshToken($data);
                    break;
                    
                case 'logout':
                    $response = handleLogout($data);
                    break;
                    
                case 'verify_auth':
                    $response = handleVerifyAuth($data);
                    break;
                    
                case 'forgotPassword':
                    $response = handleForgotPassword($data);
                    break;
                    
                case 'updateProfile':
                    $response = handleUpdateProfile($data);
                    break;
                    
                default:
                    $response = ["status" => "error", "message" => "Unknown action: " . $data['action']];
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

    // Handle user signup
    function handleSignup($data) {
        if (!isset($data['name'], $data['email'], $data['password'])) {
            return ["status" => "error", "message" => "Missing required fields"];
        }
        
        $name = $data['name'];
        $email = $data['email'];
        $password = $data['password'];
        
        try {
            $pdo = getPDO();
            
            // Check if email already exists
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                return ["status" => "error", "message" => "Email already exists"];
            }
            
            // Validate password strength
            if (strlen($password) < 8) {
                return ["status" => "error", "message" => "Password must be at least 8 characters long"];
            }
            
            // Hash password
            $hash = password_hash($password, PASSWORD_BCRYPT);
            
            // Insert new user
            $stmt = $pdo->prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
            $stmt->execute([$name, $email, $hash]);
            
            $userId = $pdo->lastInsertId();
            
            echo "✅ User registered: $email with ID: $userId\n";
            
            return [
                "status" => "success", 
                "message" => "Signup successful",
                "user" => [
                    "id" => $userId,
                    "name" => $name,
                    "email" => $email
                ]
            ];
            
        } catch (PDOException $e) {
            echo "❌ Database Error: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Database error"];
        }
    }

    // Handle user login
    function handleLogin($data) {
        if (!isset($data['email'], $data['password'])) {
            return ["status" => "error", "message" => "Missing required fields"];
        }
        
        $email = $data['email'];
        $password = $data['password'];
        
        try {
            $pdo = getPDO();
            
            $stmt = $pdo->prepare("SELECT id, name, password FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            
            if (!$user || !password_verify($password, $user['password'])) {
                return ["status" => "error", "message" => "Invalid credentials"];
            }
            
            // Generate tokens
            $accessToken = AuthUtils::generateAccessToken($user['id'], $user['name'], $email);
            $refreshToken = AuthUtils::generateRefreshToken($user['id']);
            
            // Store refresh token in database
            $refreshExpiry = time() + 2592000; // 30 days
            DBUtils::storeRefreshToken($user['id'], $refreshToken, $refreshExpiry);
            
            echo "✅ Login success: {$user['name']}\n";
            
            // Set cookies in response
            $response = [
                "status" => "success",
                "message" => "Login successful",
                "user" => [
                    "id" => $user['id'],
                    "name" => $user['name'],
                    "email" => $email
                ],
                "tokens" => [
                    "access_token" => $accessToken,
                    "refresh_token" => $refreshToken
                ]
            ];
            
            return $response;
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Server error"];
        }
    }

    // Handle refresh token
    function handleRefreshToken($data) {
        if (!isset($data['refresh_token'])) {
            return ["status" => "error", "message" => "Missing refresh token"];
        }
        
        $refreshToken = $data['refresh_token'];
        
        try {
            // Verify refresh token
            $decoded = AuthUtils::verifyRefreshToken($refreshToken);
            
            if (!$decoded || !isset($decoded->user_id)) {
                return ["status" => "error", "message" => "Invalid refresh token"];
            }
            
            $userId = $decoded->user_id;
            
            // Verify the token exists in database
            if (!DBUtils::verifyUserRefreshToken($userId, $refreshToken)) {
                return ["status" => "error", "message" => "Invalid or expired refresh token"];
            }
            
            // Get user details
            $user = DBUtils::getUserById($userId);
            
            if (!$user) {
                return ["status" => "error", "message" => "User not found"];
            }
            
            // Generate new access token
            $accessToken = AuthUtils::generateAccessToken($user['id'], $user['name'], $user['email']);
            
            echo "✅ Token refreshed for user: {$user['id']}\n";
            
            return [
                "status" => "success",
                "message" => "Token refreshed",
                "access_token" => $accessToken
            ];
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Server error"];
        }
    }

    // Handle logout
    function handleLogout($data) {
        if (!isset($data['user_id'])) {
            return ["status" => "error", "message" => "Missing user ID"];
        }
        
        $userId = $data['user_id'];
        
        try {
            // Invalidate refresh token in database
            DBUtils::invalidateRefreshToken($userId);
            
            echo "✅ Logout success for user: $userId\n";
            
            return [
                "status" => "success",
                "message" => "Logout successful"
            ];
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Server error"];
        }
    }

    // Handle auth verification
    function handleVerifyAuth($data) {
        if (!isset($data['access_token'])) {
            return ["status" => "error", "message" => "Missing access token"];
        }
        
        $accessToken = $data['access_token'];
        
        try {
            // Verify the access token
            $decoded = AuthUtils::verifyAccessToken($accessToken);
            
            if (!$decoded) {
                return ["status" => "error", "message" => "Invalid or expired access token"];
            }
            
            echo "✅ Token verified for user: {$decoded->user_id}\n";
            
            return [
                "status" => "success",
                "message" => "Token valid",
                "user" => [
                    "id" => $decoded->user_id,
                    "name" => $decoded->name,
                    "email" => $decoded->email
                ]
            ];
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Server error"];
        }
    }

    // Handle forgot password
    function handleForgotPassword($data) {
        if (!isset($data['email'])) {
            return ["status" => "error", "message" => "Missing email"];
        }
        
        $email = $data['email'];
        
        try {
            $pdo = getPDO();
            
            // Check if user exists
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            
            if (!$user) {
                return ["status" => "error", "message" => "Email not found"];
            }
            
            // Generate reset token
            $resetToken = bin2hex(random_bytes(32));
            $tokenExpiry = date('Y-m-d H:i:s', time() + 3600); // 1 hour
            
            // Store reset token in database
            $stmt = $pdo->prepare("UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?");
            $stmt->execute([$resetToken, $tokenExpiry, $user['id']]);
            
            // In a real application, send email with reset link
            // For now, we'll just return success
            echo "✅ Password reset requested for: $email\n";
            
            return [
                "status" => "success",
                "message" => "Password reset link has been sent to your email"
            ];
            
        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Server error"];
        }
    }

    // Handle profile update
    function handleUpdateProfile($data) {
        // Log the received data for debugging
        echo "📝 Profile update data: " . json_encode($data) . "\n";
        
        // Verify authentication first
        if (isset($data['access_token'])) {
            $accessToken = $data['access_token'];
            $decoded = AuthUtils::verifyAccessToken($accessToken);
            
            if (!$decoded) {
                echo "❌ Invalid or expired access token\n";
                return ["status" => "error", "message" => "Invalid or expired access token"];
            }
            
            echo "✅ Access token verified for user: {$decoded->user_id}\n";
            
            // Use the user ID from the token
            $userId = $decoded->user_id;
        } else if (isset($data['user_id'])) {
            // Fallback to user_id if provided directly
            $userId = $data['user_id'];
            echo "⚠️ Using provided user_id: $userId (no access token)\n";
        } else {
            echo "❌ No authentication provided\n";
            return ["status" => "error", "message" => "Authentication required"];
        }
        
        try {
            $pdo = getPDO();
            
            // Get current user data
            $stmt = $pdo->prepare("SELECT id, name, email, password FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            
            if (!$user) {
                return ["status" => "error", "message" => "User not found"];
            }
            
            // Start building the update query
            $updateFields = [];
            $params = [];
            
            // Update name if provided
            if (isset($data['name']) && $data['name'] !== $user['name']) {
                $updateFields[] = "name = ?";
                $params[] = $data['name'];
            }
            
            // Update email if provided and different from current
            if (isset($data['email']) && $data['email'] !== $user['email']) {
                // Check if email is already in use by another user
                $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
                $stmt->execute([$data['email'], $userId]);
                if ($stmt->fetch()) {
                    return ["status" => "error", "message" => "Email is already in use"];
                }
                
                $updateFields[] = "email = ?";
                $params[] = $data['email'];
            }
            
            // Update password if provided
            if (isset($data['currentPassword'], $data['newPassword'])) {
                // Verify current password
                if (!password_verify($data['currentPassword'], $user['password'])) {
                    return ["status" => "error", "message" => "Current password is incorrect"];
                }
                
                // Validate new password
                if (strlen($data['newPassword']) < 8) {
                    return ["status" => "error", "message" => "New password must be at least 8 characters long"];
                }
                
                // Hash new password
                $newPasswordHash = password_hash($data['newPassword'], PASSWORD_BCRYPT);
                $updateFields[] = "password = ?";
                $params[] = $newPasswordHash;
            }
            
            // If no fields to update, return success
            if (empty($updateFields)) {
                return [
                    "status" => "success",
                    "message" => "No changes to update"
                ];
            }
            
            // Build and execute update query
            $query = "UPDATE users SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $params[] = $userId;
            
            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            
            echo "✅ Profile updated for user: $userId\n";
            
            // Get updated user data
            $updatedUser = [
                "id" => $userId
            ];
            
            if (isset($data['name'])) {
                $updatedUser["name"] = $data['name'];
            } else {
                $updatedUser["name"] = $user['name'];
            }
            
            if (isset($data['email'])) {
                $updatedUser["email"] = $data['email'];
            } else {
                $updatedUser["email"] = $user['email'];
            }
            
            return [
                "status" => "success",
                "message" => "Profile updated successfully",
                "user" => $updatedUser
            ];
            
        } catch (Exception $e) {
            echo "❌ Error updating profile: " . $e->getMessage() . "\n";
            return ["status" => "error", "message" => "Server error: " . $e->getMessage()];
        }
    }

    // Helper function to get PDO connection
    function getPDO() {
        $DB_HOST = '100.82.47.115';  // HAProxy
        $DB_PORT = 3307;
        $DB_NAME = "real_estate";
        $DB_USER = "root";
        $DB_PASS = "admin";
        $DB_TIMEOUT = 5;
    
        $maxRetries = 5;
        $retryDelay = 1;
    
        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
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
                echo "✅ Connected to MySQL via HAProxy (attempt $attempt)\n";
                return $pdo;
            } catch (PDOException $e) {
                echo "❌ DB connection failed on attempt $attempt: " . $e->getMessage() . "\n";
                if ($attempt < $maxRetries) {
                    sleep($retryDelay);
                } else {
                    throw new Exception("Failed to connect to DB after $maxRetries attempts.");
                }
            }
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
