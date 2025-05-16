<?php
mysqli_report(MYSQLI_REPORT_OFF); // prevent exceptions from breaking the loop

echo "Name: ";
$name = trim(fgets(STDIN));

echo "Email: ";
$email = trim(fgets(STDIN));

echo "Password: ";
$password = trim(fgets(STDIN)); 

$hosts = ['100.82.47.115', '100.82.166.82', '100.107.33.60', '127.0.0.1'];
$port = 3306;
$db   = 'real_estate';
$user = 'root';
$pass = 'admin';
$timeout = 3; // seconds

$mysqli = null;

foreach ($hosts as $host) {
    echo "🔌 Attempting to connect to $host:$port...\n";

    $mysqli = mysqli_init();
    $mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, $timeout);
    @$mysqli->real_connect($host, $user, $pass, $db, $port);

    if ($mysqli->connect_errno === 0) {
        echo "Connected to MySQL on $host\n";
        break;
    } else {
        echo "Failed to connect to $host: " . $mysqli->connect_error . "\n";
        $mysqli = null;
    }
}

if (!$mysqli) {
    die("All DB nodes failed. Exiting.\n");
}

$stmt = $mysqli->prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
$stmt->bind_param("sss", $name, $email, $password);

if ($stmt->execute()) {
    echo "User inserted successfully.\n";
} else {
    echo "Error inserting user: " . $stmt->error . "\n";
}

$stmt->close();
$mysqli->close();
