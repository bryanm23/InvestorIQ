// backend/services/maps-service.js
const axios = require('axios');
const amqp = require('amqplib');
const config = require('../config');

// Get configuration from config service
const rabbitConfig = config.getRabbitMQConfig();
const apiKeys = config.getApiKeys();
const GOOGLE_MAPS_API_KEY = apiKeys.google_maps_key;

// RabbitMQ configuration from config service
const RABBITMQ_HOST = rabbitConfig.host;
const RABBITMQ_PORT = rabbitConfig.port;
const RABBITMQ_USER = rabbitConfig.user;
const RABBITMQ_PASS = rabbitConfig.pass;
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;
const MAPS_REQUEST_QUEUE = rabbitConfig.maps_request_queue;
const MAPS_RESPONSE_QUEUE = rabbitConfig.maps_response_queue;

// Connect to RabbitMQ and start consuming messages
async function startMapsService() {
    console.log('🗺️ Starting Maps Service...');
    
    try {
        // Connect to RabbitMQ
        console.log(`🔄 Maps Service: Connecting to RabbitMQ at ${RABBITMQ_URL}...`);
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        
        // Ensure queues exist
        await channel.assertQueue(MAPS_REQUEST_QUEUE, { durable: true });
        await channel.assertQueue(MAPS_RESPONSE_QUEUE, { durable: true });
        
        console.log(`✅ Maps Service: Connected to RabbitMQ. Waiting for maps requests...`);
        
        // Process map requests
        channel.consume(MAPS_REQUEST_QUEUE, async (msg) => {
            if (!msg) return;
            
            try {
                const request = JSON.parse(msg.content.toString());
                console.log(`📩 Maps Service: Received maps request:`, request);
                
                const { action, params, correlationId } = request;
                let response = { error: 'Unknown action' };
                
                // Process different map API requests
                switch (action) {
                    case 'geocode':
                        response = await handleGeocodeRequest(params);
                        break;
                    case 'streetView':
                        response = await handleStreetViewRequest(params);
                        break;
                    case 'directions':
                        response = await handleDirectionsRequest(params);
                        break;
                    case 'places':
                        response = await handlePlacesRequest(params);
                        break;
                    default:
                        console.error(`❌ Maps Service: Unknown action: ${action}`);
                }
                
                // Send response back
                channel.sendToQueue(
                    MAPS_RESPONSE_QUEUE,
                    Buffer.from(JSON.stringify({ 
                        ...response,
                        correlationId 
                    })),
                    { persistent: true }
                );
                
                console.log(`📤 Maps Service: Sent response for correlationId: ${correlationId}`);
                channel.ack(msg);
                
            } catch (error) {
                console.error(`❌ Maps Service: Error processing maps request:`, error);
                channel.nack(msg, false, false); // Don't requeue the message if it's invalid
            }
        });
        
        // Handle connection close
        process.once('SIGINT', async () => {
            console.log('🛑 Maps Service: Closing RabbitMQ connection...');
            await channel.close();
            await connection.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.error(`❌ Maps Service: Error:`, error);
        setTimeout(startMapsService, 5000); // Retry connection after 5 seconds
    }
}

// Handler functions for different map operations
async function handleGeocodeRequest(params) {
    try {
        const { address } = params;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await axios.get(url);
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ Maps Service: Geocode error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

async function handleStreetViewRequest(params) {
    try {
        const { latitude, longitude, size = '600x300', fov = '90' } = params;
        const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${latitude},${longitude}&fov=${fov}&key=${GOOGLE_MAPS_API_KEY}`;
        
        // For streetview, we'll just return the URL since it's an image
        return {
            status: 'success',
            data: {
                url: url
            }
        };
    } catch (error) {
        console.error(`❌ Maps Service: Street View error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

async function handleDirectionsRequest(params) {
    try {
        const { origin, destination, mode = 'driving' } = params;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await axios.get(url);
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ Maps Service: Directions error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

async function handlePlacesRequest(params) {
    try {
        const { query, location, radius = 5000 } = params;
        let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
        
        if (location) {
            url += `&location=${location.lat},${location.lng}&radius=${radius}`;
        }
        
        const response = await axios.get(url);
        return {
            status: 'success',
            data: response.data
        };
    } catch (error) {
        console.error(`❌ Maps Service: Places error:`, error);
        return {
            status: 'error',
            message: error.message,
            errorCode: error.response?.status || 500
        };
    }
}

// Start the service
startMapsService();

module.exports = { startMapsService };