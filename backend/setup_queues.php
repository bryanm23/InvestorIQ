<?php
require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

$RABBITMQ_HOST = '100.107.33.60';
$RABBITMQ_PORT = 5673;
$RABBITMQ_USER = 'admin';
$RABBITMQ_PASS = 'admin';

// List of queues to declare
$queues = [
    'front_to_back_queue',
    'property_management',
    'rentcast_queue',
    'db_to_be_queue'
];

try {
    echo "🔄 Connecting to RabbitMQ at $RABBITMQ_HOST:$RABBITMQ_PORT...\n";
    $connection = new AMQPStreamConnection($RABBITMQ_HOST, $RABBITMQ_PORT, $RABBITMQ_USER, $RABBITMQ_PASS);
    $channel = $connection->channel();

    foreach ($queues as $queue) {
        echo "📦 Declaring queue: $queue\n";
        // durable=true, exclusive=false, auto_delete=false
        $channel->queue_declare($queue, false, true, false, false);
        echo "✅ Queue declared: $queue\n";
    }

    $channel->close();
    $connection->close();
    echo "✨ All queues have been declared successfully!\n";
} catch (Exception $e) {
    echo "❌ Error setting up queues: " . $e->getMessage() . "\n";
    exit(1);
} 