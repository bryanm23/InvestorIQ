const amqp = require('amqplib');
const axios = require('axios');

// === 🔒 Hardcoded API Key & RabbitMQ Config ===
const RENTCAST_API_KEY = "3d587c5223604e4b874588109b9aea47";

const RABBITMQ_HOST = "100.107.33.60";
const RABBITMQ_PORT = 5673;
const RABBITMQ_USER = "admin";
const RABBITMQ_PASS = "admin";

const RENTCAST_REQUEST_QUEUE = "rentcast_requests";
const RENTCAST_RESPONSE_QUEUE = "rentcast_responses";

const amqpUrl = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

(async () => {
  try {
    console.log(`🔄 RentCast Service: Connecting to RabbitMQ at ${amqpUrl}...`);
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    await channel.assertQueue(RENTCAST_REQUEST_QUEUE, { durable: true });
    await channel.assertQueue(RENTCAST_RESPONSE_QUEUE, { durable: true });

    console.log("✅ RentCast Service: Connected to RabbitMQ. Waiting for rentcast requests...");

    channel.consume(RENTCAST_REQUEST_QUEUE, async (msg) => {
      const replyTo = msg.properties.replyTo;
      const correlationId = msg.properties.correlationId;

      const request = JSON.parse(msg.content.toString());
      const { action, params: rawParams } = request;

      // ✅ Clean out empty values
      const params = {};
      for (const key in rawParams) {
        if (rawParams[key] !== "" && rawParams[key] !== null && rawParams[key] !== undefined) {
          params[key] = rawParams[key];
        }
      }

      console.log("📩 RentCast Service: Received rentcast request:", { action, params });

      let response = {
        status: "error",
        message: "Invalid action"
      };

      try {
        switch (action) {
          case "searchProperties":
            if (!params.zipCode && !params.city && !params.state) {
              throw new Error("zipCode or city/state is required");
            }
            response = await makeApiRequest("https://api.rentcast.io/v1/properties/search", params);
            break;

          case "getPropertyDetails":
            if (!params.propertyId) throw new Error("propertyId is required");
            response = await makeApiRequest(`https://api.rentcast.io/v1/properties/${params.propertyId}`);
            break;

          case "getRentalEstimate":
            response = await makeApiRequest("https://api.rentcast.io/v1/rents/estimate", params, "POST");
            break;

          case "getMarketData":
            response = await makeApiRequest("https://api.rentcast.io/v1/markets", params);
            break;

          default:
            throw new Error("Unknown action");
        }
      } catch (err) {
        console.error("❌ RentCast Service Error:", err.message);
        response = {
          status: "error",
          message: err.message
        };
      }

      response.correlationId = correlationId;

      channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(response)), {
        correlationId: correlationId
      });

      console.log(`📤 RentCast Service: Sent response for correlationId: ${correlationId}`);
    }, { noAck: true });

  } catch (err) {
    console.error("❌ RentCast Service Error:", err);
  }
})();

async function makeApiRequest(url, params = {}, method = "GET") {
  const options = {
    method,
    url,
    headers: {
      "X-Api-Key": RENTCAST_API_KEY,
      "Content-Type": "application/json"
    }
  };

  if (method === "GET") {
    const queryParams = new URLSearchParams(params).toString();
    options.url += `?${queryParams}`;
  } else {
    options.data = params;
  }

  const res = await axios(options);
  return { status: "success", data: res.data };
}
