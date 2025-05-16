<?php
// db_utils.php

class DBUtils {
    private static function getPDO() {
        $DB_HOST = '100.82.47.115';  // HAProxy IP
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
            return $pdo;
        } catch (PDOException $e) {
            throw new Exception("Database connection failed: " . $e->getMessage());
        }
    }
    
    
    /**
     * Store a new refresh token for a user
     */
    public static function storeRefreshToken($userId, $refreshToken, $expiryTimestamp) {
        try {
            $pdo = self::getPDO();
            
            // Store only the hash of the token for additional security
            $tokenHash = password_hash($refreshToken, PASSWORD_BCRYPT);
            $expiryDate = date('Y-m-d H:i:s', $expiryTimestamp);
            $currentDate = date('Y-m-d H:i:s');
            
            $stmt = $pdo->prepare(
                "UPDATE users 
                SET refresh_token = ?, 
                    refresh_token_expiry = ?,
                    last_login = ?
                WHERE id = ?"
            );
            
            return $stmt->execute([$tokenHash, $expiryDate, $currentDate, $userId]);
        } catch (Exception $e) {
            error_log("Error storing refresh token: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Verify a refresh token is valid for a user
     */
    public static function verifyUserRefreshToken($userId, $refreshToken) {
        try {
            $pdo = self::getPDO();
            
            $stmt = $pdo->prepare(
                "SELECT refresh_token, refresh_token_expiry 
                FROM users 
                WHERE id = ?"
            );
            
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            
            if (!$user) {
                return false;
            }
            
            // Check if token has expired
            $now = new DateTime();
            $expiry = new DateTime($user['refresh_token_expiry']);
            
            if ($now > $expiry) {
                return false;
            }
            
            // Verify token hash matches
            return password_verify($refreshToken, $user['refresh_token']);
            
        } catch (Exception $e) {
            error_log("Error verifying refresh token: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Invalidate a user's refresh token
     */
    public static function invalidateRefreshToken($userId) {
        try {
            $pdo = self::getPDO();
            
            $stmt = $pdo->prepare(
                "UPDATE users 
                SET refresh_token = NULL, 
                    refresh_token_expiry = NULL 
                WHERE id = ?"
            );
            
            return $stmt->execute([$userId]);
        } catch (Exception $e) {
            error_log("Error invalidating refresh token: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Get user by ID
     */
    public static function getUserById($userId) {
        try {
            $pdo = self::getPDO();
            
            $stmt = $pdo->prepare(
                "SELECT id, name, email, created_at 
                FROM users 
                WHERE id = ?"
            );
            
            $stmt->execute([$userId]);
            return $stmt->fetch();
        } catch (Exception $e) {
            error_log("Error getting user by ID: " . $e->getMessage());
            return false;
        }
    }
}
?>