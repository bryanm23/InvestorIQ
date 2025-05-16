<?php
/**
 * Cache Cleanup Script
 * 
 * This script cleans up expired cache files from the cache directory.
 * It can be run manually or set up as a cron job to run periodically.
 * 
 * Usage: php cache_cleanup.php
 */

// Configuration
$cacheDir = __DIR__ . '/cache';
$logFile = __DIR__ . '/cache_cleanup.log';

// Default expiry time (24 hours in seconds)
$defaultExpiry = 86400;

// Custom expiry times for different cache types (in seconds)
$expiryTimes = [
    'property_' => 3600,        // Property data: 1 hour
    'market_' => 86400,         // Market data: 24 hours
    'auth_' => 1800,            // Auth data: 30 minutes
    'default' => $defaultExpiry // Default: 24 hours
];

// Function to log messages
function logMessage($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] $message\n";
    file_put_contents($logFile, $logEntry, FILE_APPEND);
    echo $logEntry;
}

// Check if cache directory exists
if (!is_dir($cacheDir)) {
    logMessage("Cache directory does not exist: $cacheDir");
    exit(1);
}

logMessage("Starting cache cleanup...");
$startTime = microtime(true);
$totalFiles = 0;
$deletedFiles = 0;
$errorFiles = 0;

// Get all files in the cache directory
$files = glob($cacheDir . '/*.json');
$totalFiles = count($files);

foreach ($files as $file) {
    try {
        $filename = basename($file);
        $fileAge = time() - filemtime($file);
        
        // Determine expiry time based on filename prefix
        $expiry = $defaultExpiry;
        foreach ($expiryTimes as $prefix => $time) {
            if (strpos($filename, $prefix) === 0) {
                $expiry = $time;
                break;
            }
        }
        
        // Delete file if it's older than its expiry time
        if ($fileAge > $expiry) {
            if (unlink($file)) {
                $deletedFiles++;
            } else {
                logMessage("Failed to delete file: $file");
                $errorFiles++;
            }
        }
    } catch (Exception $e) {
        logMessage("Error processing file $file: " . $e->getMessage());
        $errorFiles++;
    }
}

$endTime = microtime(true);
$duration = round($endTime - $startTime, 2);

logMessage("Cache cleanup completed in $duration seconds.");
logMessage("Total files: $totalFiles");
logMessage("Deleted files: $deletedFiles");
logMessage("Errors: $errorFiles");
logMessage("Remaining files: " . ($totalFiles - $deletedFiles));
?>
