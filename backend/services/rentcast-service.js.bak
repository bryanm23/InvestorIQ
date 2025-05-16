// backend/services/rentcast-service.js
const axios = require('axios');
const amqp = require('amqplib');
const config = require('../config');

// Get configuration from config service
const rabbitConfig = config.getRabbitMQConfig();
const apiKeys = config.getApiKeys();
const RENTCAST_API_KEY = apiKeys.rentcast_key;

// RabbitMQ configuration from config service
const RABBITMQ_HOST = rabbitConfig.host;
const RABBITMQ_PORT = rabbitConfig.port;
const RABBITMQ_USER = rabbitConfig.user;
const RABBITMQ_PASS = rabbitConfig.pass;
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;
const RENTCAST_REQUEST_QUEUE = rabbitConfig.rentcast_request_queue;
const RENTCAST_RESPONSE_QUEUE = rabbitConfig.rentcast_response_queue;

// Connect to RabbitMQ and start consuming messages
async function startRentcastService() {
    console.log('🏠 Starting RentCast Service...');
    
    try {
        // Connect to RabbitMQ
        console.log(`🔄 RentCast Service: Connecting to RabbitMQ at ${RABBITMQ_URL}...`);
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        
        // Ensure queues exist
        await channel.assertQueue(RENTCAST_REQUEST_QUEUE, { durable: true });
        await channel.assertQueue(RENTCAST_RESPONSE_QUEUE, { durable: true });
        
        console.log(`✅ RentCast Service: Connected to RabbitMQ. Waiting for rentcast requests...`);
        
        // Process rentcast requests
        channel.consume(RENTCAST_REQUEST_QUEUE, async (msg) => {
            if (!msg) return;
            
            try {
                const request = JSON.parse(msg.content.toString());
                console.log(`📩 RentCast Service: Received rentcast request:`, request);
                
                const { action, params, correlationId } = request;
                let response = { error: 'Unknown action' };
                
                // Process different RentCast API requests
                switch (action) {
                    case 'searchProperties':
                        response = await handlePropertySearch(params);
                        break;
                    case 'getPropertyDetails':
                        response = await handlePropertyDetails(params);
                        break;
                    case 'getRentalEstimate':
                        response = await handleRentalEstimate(params);
                        break;
                    case 'getMarketData':
                        response = await handleMarketData(params);
                        break;
                    default:
                        console.error(`❌ RentCast Service: Unknown action: ${action}`);
                }
                
                // Send response back
                channel.sendToQueue(
                    RENTCAST_RESPONSE_QUEUE,
                    Buffer.from(JSON.stringify({ 
                        ...response,
                        correlationId 
                    })),
                    { persistent: true }
                );
                
                console.log(`📤 RentCast Service: Sent response for correlationId: ${correlationId}`);
                channel.ack(msg);
                
            } catch (error) {
                console.error(`❌ RentCast Service: Error processing rentcast request:`, error);
                channel.nack(msg, false, false); // Don't requeue the message if it's invalid
            }
        });
        
        // Handle connection close
        process.once('SIGINT', async () => {
            console.log('🛑 RentCast Service: Closing RabbitMQ connection...');
            await channel.close();
            await connection.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.error(`❌ RentCast Service: Error:`, error);
        setTimeout(startRentcastService, 5000); // Retry connection after 5 seconds
    }
}

// Handler functions for different RentCast operations
async function handlePropertySearch(params) {
    try {
        // Construct query parameters from the provided params
        const queryParams = new URLSearchParams();
        
        Object.entries(params).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });
        
        const baseUrl = "https://api.rentcast.io/v1/properties";
        const url = `${baseUrl}?${queryParams.toString()}`;
        
        const response = await axios.get(url, {
            headers: {
                "X-Api-Key": RENTCAST_API_KEY,
                "Accept": "application/json"
            }
        });
        
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ RentCast Service: Property search error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

async function handlePropertyDetails(params) {
    try {
        const { propertyId } = params;
        
        if (!propertyId) {
            return {
                status: 'error',
                message: 'Property ID is required'
            };
        }
        
        const url = `https://api.rentcast.io/v1/properties/${propertyId}`;
        
        const response = await axios.get(url, {
            headers: {
                "X-Api-Key": RENTCAST_API_KEY,
                "Accept": "application/json"
            }
        });
        
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ RentCast Service: Property details error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

async function handleRentalEstimate(params) {
    try {
        const { address, bedrooms, bathrooms, propertyType, squareFootage } = params;
        
        if (!address) {
            return {
                status: 'error',
                message: 'Address is required'
            };
        }
        
        const url = `https://api.rentcast.io/v1/rental-estimate`;
        
        const requestBody = {
            address,
            bedrooms,
            bathrooms,
            propertyType,
            squareFootage
        };
        
        const response = await axios.post(url, requestBody, {
            headers: {
                "X-Api-Key": RENTCAST_API_KEY,
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });
        
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ RentCast Service: Rental estimate error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

async function handleMarketData(params) {
    try {
        const { zipCode, city, state } = params;
        
        if (!zipCode && (!city || !state)) {
            return {
                status: 'error',
                message: 'Either zipCode or city and state are required'
            };
        }
        
        const url = `https://api.rentcast.io/v1/market`;
        
        const queryParams = new URLSearchParams();
        if (zipCode) queryParams.append('zipCode', zipCode);
        if (city) queryParams.append('city', city);
        if (state) queryParams.append('state', state);
        
        const response = await axios.get(`${url}?${queryParams.toString()}`, {
            headers: {
                "X-Api-Key": RENTCAST_API_KEY,
                "Accept": "application/json"
            }
        });
        
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ RentCast Service: Market data error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

// Start the service
startRentcastService();

module.exports = { startRentcastService };