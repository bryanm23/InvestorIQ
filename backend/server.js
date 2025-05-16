require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");


const app = express();
app.use(express.json());

const allowedOrigins = [
    "http://10.0.8.49:8079",
    "http://localhost:8079"  // Keep for local development
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: "GET,POST,PUT,DELETE"
}));

const PORT = process.env.PORT || 8081;

// PHP worker scripts
const FRONT_TO_BACK_RECEIVER = path.join(__dirname, "front_to_back_receiver.php");
const DB_TO_BE_RECEIVER = path.join(__dirname, "db_to_be_receiver.php");
const RENTCAST_RECEIVER = path.join(__dirname, "rentcast_receiver.php");
const PROPERTY_MANAGER_RECEIVER = path.join(__dirname, "property_manager_receiver.php");


// Start PHP background services
function startPHPProcess(script, name) {
    console.log(`🚀 Starting ${name}...`);
    const process = spawn("php", [script], { stdio: "inherit", shell: true });

    process.on("close", (code) => {
        console.error(`❌ ${name} exited with code ${code}`);
        setTimeout(() => {
            console.log(`🔄 Restarting ${name}...`);
            startPHPProcess(script, name);
        }, 5000);
    });

    return process;
}

// Start maps and rentcast services
function startServices() {
    console.log('🧩 Starting backend services...');
    require('./services/maps-service');
    require('./services/rentcast-service');
}

// Auth placeholder
app.post("/api/auth/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        res.status(200).json({ message: "Signup request sent successfully!" });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: "Failed to process signup request." });
    }
});

// Health checks
app.get('/health', (req, res) => res.status(200).json({ status: 'healthy' }));

app.get('/rabbitmq-health', (req, res) => {
    const { exec } = require('child_process');
    exec('rabbitmqctl status', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ status: 'unhealthy', message: error.message });
        }
        return res.status(200).json({
            status: 'healthy',
            message: 'RabbitMQ is running',
            queues: ['frontend_to_backend', 'rentcast_queue']
        });
    });
});

// Start server and all services
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);

    // Start RabbitMQ PHP workers
    startPHPProcess(FRONT_TO_BACK_RECEIVER, "front_to_back_receiver.php");
    startPHPProcess(DB_TO_BE_RECEIVER, "db_to_be_receiver.php");
    startPHPProcess(RENTCAST_RECEIVER, "rentcast_receiver.php");
    startPHPProcess(PROPERTY_MANAGER_RECEIVER, "property_manager_receiver.php");


    startServices();
});


