<?php
require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

$RABBITMQ_HOST = "100.107.33.60";
$RABBITMQ_PORT = 5673;
$RABBITMQ_USER = "admin";
$RABBITMQ_PASS = "admin";
$RABBITMQ_QUEUE = "frontend_to_backend";

$DB_HOST = '100.82.47.115';
$DB_PORT = 3307;
$DB_NAME = "real_estate";
$DB_USER = "root";
$DB_PASS = "admin";
$DB_TIMEOUT = 5;

try {
    echo "🔄 Connecting to RabbitMQ...\n";
    $connection = new AMQPStreamConnection($RABBITMQ_HOST, $RABBITMQ_PORT, $RABBITMQ_USER, $RABBITMQ_PASS);
    $channel = $connection->channel();
    $channel->queue_declare($RABBITMQ_QUEUE, false, true, false, false);
    echo "✅ Waiting for DB messages on queue: $RABBITMQ_QUEUE\n";

    $channel->basic_consume($RABBITMQ_QUEUE, '', false, true, false, false, function ($msg) use ($DB_HOST, $DB_PORT, $DB_NAME, $DB_USER, $DB_PASS, $DB_TIMEOUT) {
        echo "📩 Received message: {$msg->body}\n";

        $data = json_decode($msg->body, true);
        $channel = $msg->getChannel();
        $replyTo = $msg->get('reply_to');
        $corrId = $msg->get('correlation_id');

        $response = ["status" => "error", "message" => "Unknown error"];

        if (!$data || !isset($data['action'])) {
            echo "❌ Invalid message: 'action' missing\n";
            return;
        }

        // ✅ Skip unrelated actions (like rentcast_search, maps_geocode, etc.)
        if (!in_array($data['action'], ['signup', 'login'])) {
            echo "⏭ Skipping unrelated action: {$data['action']}\n";
            return;
        }

        try {
            echo "🔌 Connecting to MySQL via HAProxy...\n";
$pdo = new PDO(
    'mysql:host=100.82.47.115;port=3307;dbname=real_estate;charset=utf8',
    'root',
    'admin',
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5
    ]
);
echo "✅ Connected to MySQL via HAProxy\n";


            if ($data['action'] === 'signup') {
                $name = $data['name'] ?? ($data['username'] ?? '');
                $email = $data['email'] ?? '';
                $password = $data['password'] ?? '';

                if (!$name || !$email || !$password) {
                    $response = ["status" => "error", "message" => "Missing signup fields"];
                } else {
                    $hash = password_hash($password, PASSWORD_BCRYPT);
                    $stmt = $pdo->prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
                    $stmt->execute([$name, $email, $hash]);
                    $response = ["status" => "success", "message" => "Signup successful"];
                    echo "✅ User registered: $email\n";
                }

            } elseif ($data['action'] === 'login') {
                $email = $data['email'] ?? '';
                $password = $data['password'] ?? '';

                $stmt = $pdo->prepare("SELECT id, name, password FROM users WHERE email = ?");
                $stmt->execute([$email]);
                $user = $stmt->fetch();

                if ($user && password_verify($password, $user['password'])) {
                    $response = [
                        "status" => "success",
                        "message" => "Login successful",
                        "user" => [
                            "id" => $user['id'],
                            "name" => $user['name'],
                            "email" => $email
                        ]
                    ];
                    echo "✅ Login success: {$user['name']}\n";
                } else {
                    $response = ["status" => "error", "message" => "Invalid credentials"];
                    echo "❌ Login failed for $email\n";
                }
            }

            if ($replyTo && $corrId) {
                $replyMsg = new AMQPMessage(json_encode($response), [
                    'correlation_id' => $corrId
                ]);
                $channel->basic_publish($replyMsg, '', $replyTo);
                echo "📤 Replied to $replyTo with correlation_id $corrId\n";
            }

        } catch (Exception $e) {
            echo "❌ Error: " . $e->getMessage() . "\n";
            if ($replyTo && $corrId) {
                $errorResponse = [
                    "status" => "error",
                    "message" => "Server error: " . $e->getMessage()
                ];
                $replyMsg = new AMQPMessage(json_encode($errorResponse), [
                    'correlation_id' => $corrId
                ]);
                $channel->basic_publish($replyMsg, '', $replyTo);
            }
        }
    });

    while ($channel->is_consuming()) {
        $channel->wait();
    }

    $channel->close();
    $connection->close();

} catch (Exception $e) {
    echo "❌ Fatal error: " . $e->getMessage() . "\n";
}
