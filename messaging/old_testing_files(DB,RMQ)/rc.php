<?php
require_once __DIR__ . '/messaging/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

$host = '100.107.33.60';
$port = 5673;
$user = 'admin';          
$pass = 'admin';         
$vhost = '/';

try {
    $connection = new AMQPStreamConnection($host, $port, $user, $pass, $vhost);
    $channel = $connection->channel();

    $queue = 'test_queue';
    $channel->queue_declare($queue, false, true, false, false);

    echo " Waiting for messages on queue '{$queue}'...\n";

    $callback = function ($msg) {
        echo " Received: " . $msg->body . "\n";
    };

    $channel->basic_consume($queue, '', false, true, false, false, $callback);

    while ($channel->is_consuming()) {
        $channel->wait();
    }

    $channel->close();
    $connection->close();
} catch (Exception $e) {
    echo "Error receiving message: " . $e->getMessage() . "\n";
}
