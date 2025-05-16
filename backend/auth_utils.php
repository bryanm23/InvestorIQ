<?php
// auth_utils.php

require_once __DIR__ . '/vendor/autoload.php';
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class AuthUtils {
    private static $accessTokenSecret = 'kYw9G#r82pL@t6Mz^1U0eBzDf!LmQcVr'; // Change this to a strong, random value
    private static $refreshTokenSecret = 'zXp7H&cV3mJ!oNwA^4TeYqBn*KgUuDsR'; // Change this to a strong, random value
    
    // Access token expires in 15 minutes
    private static $accessTokenExpiry = 900; 
    
    // Refresh token expires in 30 days
    private static $refreshTokenExpiry = 2592000;
    
    /**
     * Generate a new access token
     */
    public static function generateAccessToken($userId, $name, $email) {
        $issuedAt = time();
        $expiresAt = $issuedAt + self::$accessTokenExpiry;
        
        $payload = [
            'iat' => $issuedAt,
            'exp' => $expiresAt,
            'user_id' => $userId,
            'name' => $name,
            'email' => $email
        ];
        
        return JWT::encode($payload, self::$accessTokenSecret, 'HS256');
    }
    
    /**
     * Generate a new refresh token
     */
    public static function generateRefreshToken($userId) {
        $issuedAt = time();
        $expiresAt = $issuedAt + self::$refreshTokenExpiry;
        
        $payload = [
            'iat' => $issuedAt,
            'exp' => $expiresAt,
            'user_id' => $userId,
            'token_type' => 'refresh'
        ];
        
        return JWT::encode($payload, self::$refreshTokenSecret, 'HS256');
    }
    
    /**
     * Verify access token and return decoded payload
     */
    public static function verifyAccessToken($token) {
        try {
            if (empty($token) || !is_string($token)) {
                throw new \Exception("Invalid token input");
            }
            return JWT::decode($token, new Key(self::$accessTokenSecret, 'HS256'));
        } catch (\Throwable $e) {
            error_log("❌ verifyAccessToken failed: " . $e->getMessage());
            return false;
        }
    }
    
    public static function verifyRefreshToken($token) {
        try {
            if (empty($token) || !is_string($token)) {
                throw new \Exception("Invalid token input");
            }
            return JWT::decode($token, new Key(self::$refreshTokenSecret, 'HS256'));
        } catch (\Throwable $e) {
            error_log("❌ verifyRefreshToken failed: " . $e->getMessage());
            return false;
        }
    }
    
/*    public static function verifyAccessToken($token) {
        try {
            $decoded = JWT::decode($token, new Key(self::$accessTokenSecret, 'HS256'));
            return $decoded;
        } catch (Exception $e) {
            return false;
        }
    }
    
    
     //Verify refresh token and return decoded payload

    public static function verifyRefreshToken($token) {
        try {
            $decoded = JWT::decode($token, new Key(self::$refreshTokenSecret, 'HS256'));
            return $decoded;
        } catch (Exception $e) {
            return false;
        }
    }
*/

    
    /**
     * Set HTTP-only secure cookies
     */
    public static function setAuthCookies($accessToken, $refreshToken) {
        // Set access token cookie - HTTP only, secure
        setcookie('access_token', $accessToken, [
            'expires' => time() + self::$accessTokenExpiry,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => true // Set to true in production
        ]);
        
        // Set refresh token cookie - HTTP only, secure
        setcookie('refresh_token', $refreshToken, [
            'expires' => time() + self::$refreshTokenExpiry,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => true // Set to true in production
        ]);
    }
    
    /**
     * Clear auth cookies on logout
     */
    public static function clearAuthCookies() {
        setcookie('access_token', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => true
        ]);
        
        setcookie('refresh_token', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => true
        ]);
    }
}
?>