#!/usr/bin/env node

/**
 * Secure API Key Manager for InvestorIQ
 * 
 * This script manages API keys securely by storing them in an encrypted file
 * and providing tools to manage them.
 * 
 * Usage:
 *   node api-key-manager.js setup     - Initial setup
 *   node api-key-manager.js update    - Update a key
 *   node api-key-manager.js test      - Test API keys
 *   node api-key-manager.js help      - Show help
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');

// Paths
const CONFIG_DIR = path.join(__dirname, '.secure');
const KEY_FILE = path.join(CONFIG_DIR, 'encryption.key');
const SECURE_FILE = path.join(CONFIG_DIR, 'api_keys.json');
const ENV_TEMPLATE = path.join(__dirname, '.env.example');
const ENV_FILE = path.join(__dirname, '.env');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompts the user for input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} - User input
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Creates a secure random key
 * @returns {Buffer} - Random key
 */
function generateSecretKey() {
  return crypto.randomBytes(32); // 256 bits
}

/**
 * Encrypts data using AES-256-GCM
 * @param {string} text - Text to encrypt
 * @param {Buffer} key - Encryption key
 * @returns {string} - Encrypted data
 */
function encrypt(text, key) {
  const iv = crypto.randomBytes(16); // Initialization vector
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag().toString('base64');
  
  // Return IV + AuthTag + Encrypted data
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts data using AES-256-GCM
 * @param {string} encryptedData - Encrypted data
 * @param {Buffer} key - Encryption key
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedData, key) {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encryptedText = parts[2];
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Tests the Google Maps API key
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<boolean>} - True if key is valid
 */
async function testGoogleMapsApiKey(apiKey) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=New%20York&key=${apiKey}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.status === 'OK') {
      return true;
    }
    
    console.error(`❌ Google Maps API key is invalid: ${response.data.status}`);
    return false;
  } catch (error) {
    console.error(`❌ Google Maps API key test failed: ${error.message}`);
    return false;
  }
}

/**
 * Tests the RentCast API key
 * @param {string} apiKey - RentCast API key
 * @returns {Promise<boolean>} - True if key is valid
 */
async function testRentcastApiKey(apiKey) {
  try {
    const url = 'https://api.rentcast.io/v1/properties?limit=1';
    const response = await axios.get(url, {
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json'
      }
    });
    
    if (response.data) {
      return true;
    }
    
    console.error('❌ RentCast API key is invalid');
    return false;
  } catch (error) {
    console.error(`❌ RentCast API key test failed: ${error.message}`);
    return false;
  }
}

/**
 * Sets up the API key manager
 */
async function setup() {
  console.log('🔐 Setting up Secure API Key Manager');
  
  // Create config directory if it doesn't exist
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    console.log(`✅ Created directory: ${CONFIG_DIR}`);
  }
  
  // Generate and save encryption key
  const key = generateSecretKey();
  fs.writeFileSync(KEY_FILE, key);
  console.log(`✅ Generated and saved encryption key to ${KEY_FILE}`);
  
  // Collect API keys
  const googleMapsApiKey = await prompt('Enter Google Maps API Key: ');
  const rentcastApiKey = await prompt('Enter RentCast API Key: ');
  
  // Test API keys if user wants to
  const testKeys = await prompt('Test API keys? (y/n): ');
  
  if (testKeys.toLowerCase() === 'y') {
    console.log('🔄 Testing Google Maps API key...');
    const googleMapsValid = await testGoogleMapsApiKey(googleMapsApiKey);
    console.log(googleMapsValid ? '✅ Google Maps API key is valid' : '❌ Google Maps API key is invalid');
    
    console.log('🔄 Testing RentCast API key...');
    const rentcastValid = await testRentcastApiKey(rentcastApiKey);
    console.log(rentcastValid ? '✅ RentCast API key is valid' : '❌ RentCast API key is invalid');
    
    if (!googleMapsValid || !rentcastValid) {
      const proceed = await prompt('Some API keys are invalid. Proceed anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('🛑 Setup aborted');
        process.exit(1);
      }
    }
  }
  
  // Create and encrypt API keys JSON
  const apiKeys = {
    google_maps_api_key: googleMapsApiKey,
    rentcast_api_key: rentcastApiKey
  };
  
  const encryptedData = encrypt(JSON.stringify(apiKeys), key);
  fs.writeFileSync(SECURE_FILE, encryptedData);
  console.log(`✅ API keys securely saved to ${SECURE_FILE}`);
  
  // Create decrypted file for services
  const securePath = path.join(CONFIG_DIR, 'api_keys.json');
  fs.writeFileSync(securePath, JSON.stringify(apiKeys, null, 2));
  console.log(`✅ Created decrypted API keys file at ${securePath}`);
  
  // Create .env file with API keys if it doesn't exist
  if (!fs.existsSync(ENV_FILE) && fs.existsSync(ENV_TEMPLATE)) {
    let envContent = fs.readFileSync(ENV_TEMPLATE, 'utf8');
    
    // Replace placeholders with actual keys
    envContent = envContent.replace('your_google_maps_api_key_here', googleMapsApiKey);
    envContent = envContent.replace('your_rentcast_api_key_here', rentcastApiKey);
    
    fs.writeFileSync(ENV_FILE, envContent);
    console.log(`✅ Created .env file with API keys at ${ENV_FILE}`);
  }
  
  console.log('✅ Setup complete');
}

/**
 * Updates API keys
 */
async function update() {
  console.log('🔄 Updating API Keys');
  
  // Check if setup was completed
  if (!fs.existsSync(KEY_FILE) || !fs.existsSync(SECURE_FILE)) {
    console.error('❌ Setup not completed. Run "node api-key-manager.js setup" first');
    process.exit(1);
  }
  
  // Load encryption key
  const key = fs.readFileSync(KEY_FILE);
  
  // Decrypt existing API keys
  const encryptedData = fs.readFileSync(SECURE_FILE, 'utf8');
  let apiKeys;
  
  try {
    apiKeys = JSON.parse(decrypt(encryptedData, key));
  } catch (error) {
    console.error('❌ Failed to decrypt API keys:', error.message);
    process.exit(1);
  }
  
  // Display current keys (partially obscured)
  console.log('Current API Keys:');
  
  const obscureKey = (key) => {
    if (!key) return 'Not set';
    return key.substr(0, 4) + '...' + key.substr(-4);
  };
  
  console.log(`1. Google Maps API Key: ${obscureKey(apiKeys.google_maps_api_key)}`);
  console.log(`2. RentCast API Key: ${obscureKey(apiKeys.rentcast_api_key)}`);
  
  // Ask which key to update
  const choice = await prompt('Which key do you want to update? (1/2/both): ');
  
  if (choice === '1' || choice === 'both') {
    apiKeys.google_maps_api_key = await prompt('Enter new Google Maps API Key: ');
    
    const testKey = await prompt('Test this key? (y/n): ');
    if (testKey.toLowerCase() === 'y') {
      console.log('🔄 Testing Google Maps API key...');
      const valid = await testGoogleMapsApiKey(apiKeys.google_maps_api_key);
      console.log(valid ? '✅ Google Maps API key is valid' : '❌ Google Maps API key is invalid');
    }
  }
  
  if (choice === '2' || choice === 'both') {
    apiKeys.rentcast_api_key = await prompt('Enter new RentCast API Key: ');
    
    const testKey = await prompt('Test this key? (y/n): ');
    if (testKey.toLowerCase() === 'y') {
      console.log('🔄 Testing RentCast API key...');
      const valid = await testRentcastApiKey(apiKeys.rentcast_api_key);
      console.log(valid ? '✅ RentCast API key is valid' : '❌ RentCast API key is invalid');
    }
  }
  
  // Encrypt and save updated keys
  const updatedEncryptedData = encrypt(JSON.stringify(apiKeys), key);
  fs.writeFileSync(SECURE_FILE, updatedEncryptedData);
  console.log(`✅ Updated API keys securely saved to ${SECURE_FILE}`);
  
  // Update decrypted file for services
  const securePath = path.join(CONFIG_DIR, 'api_keys.json');
  fs.writeFileSync(securePath, JSON.stringify(apiKeys, null, 2));
  console.log(`✅ Updated decrypted API keys file at ${securePath}`);
  
  // Update .env file if it exists
  if (fs.existsSync(ENV_FILE)) {
    let envContent = fs.readFileSync(ENV_FILE, 'utf8');
    
    // Replace existing keys with new keys
    envContent = envContent.replace(/GOOGLE_MAPS_API_KEY=.*/g, `GOOGLE_MAPS_API_KEY=${apiKeys.google_maps_api_key}`);
    envContent = envContent.replace(/RENTCAST_API_KEY=.*/g, `RENTCAST_API_KEY=${apiKeys.rentcast_api_key}`);
    
    fs.writeFileSync(ENV_FILE, envContent);
    console.log(`✅ Updated .env file with new API keys at ${ENV_FILE}`);
  }
  
  console.log('✅ Update complete');
}

/**
 * Tests API keys
 */
async function testKeys() {
  console.log('🔍 Testing API Keys');
  
  // Check if setup was completed
  if (!fs.existsSync(KEY_FILE) || !fs.existsSync(SECURE_FILE)) {
    console.error('❌ Setup not completed. Run "node api-key-manager.js setup" first');
    process.exit(1);
  }
  
  // Load encryption key
  const key = fs.readFileSync(KEY_FILE);
  
  // Decrypt existing API keys
  const encryptedData = fs.readFileSync(SECURE_FILE, 'utf8');
  let apiKeys;
  
  try {
    apiKeys = JSON.parse(decrypt(encryptedData, key));
  } catch (error) {
    console.error('❌ Failed to decrypt API keys:', error.message);
    process.exit(1);
  }
  
  // Test Google Maps API key
  console.log('🔄 Testing Google Maps API key...');
  const googleMapsValid = await testGoogleMapsApiKey(apiKeys.google_maps_api_key);
  console.log(googleMapsValid ? '✅ Google Maps API key is valid' : '❌ Google Maps API key is invalid');
  
  // Test RentCast API key
  console.log('🔄 Testing RentCast API key...');
  const rentcastValid = await testRentcastApiKey(apiKeys.rentcast_api_key);
  console.log(rentcastValid ? '✅ RentCast API key is valid' : '❌ RentCast API key is invalid');
  
  console.log('✅ Testing complete');
}

/**
 * Shows help information
 */
function showHelp() {
  console.log(`
Secure API Key Manager for InvestorIQ

Usage:
  node api-key-manager.js setup     - Initial setup
  node api-key-manager.js update    - Update a key
  node api-key-manager.js test      - Test API keys
  node api-key-manager.js help      - Show this help
  `);
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2] || 'help';
  
  switch (command) {
    case 'setup':
      await setup();
      break;
    case 'update':
      await update();
      break;
    case 'test':
      await testKeys();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
  
  rl.close();
}

// Run main function
main();