<?php
require_once __DIR__ . '/messaging/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

$host = '100.82.47.115';  
$port = 5673;
$user = 'admin';        
$pass = 'admin';         
$vhost = '/';

try {
    $connection = new AMQPStreamConnection($host, $port, $user, $pass, $vhost);
    $channel = $connection->channel();

    $queue = 'test_queue';
    $channel->queue_declare($queue, false, true, false, false);

    $msg = new AMQPMessage('Hello from PHP!');
    $channel->basic_publish($msg, '', $queue);

    echo "Message sent to queue '{$queue}'\n";

    $channel->close();
    $connection->close();
} catch (Exception $e) {
    echo "Failed to send message: " . $e->getMessage() . "\n";
}
