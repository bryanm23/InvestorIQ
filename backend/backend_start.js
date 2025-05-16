const { exec } = require("child_process");
const path = require("path");

// Get absolute paths
const backendPath = path.resolve(__dirname); // Backend directory
const vendorPath = path.join(backendPath, "vendor"); // Composer dependencies

console.log("🚀 Starting Backend Services...");

// Validate paths before execution
const validatePath = (folder, name) => {
    const fs = require("fs");
    if (!fs.existsSync(folder)) {
        console.error(`❌ ERROR: ${name} directory not found at ${folder}`);
        process.exit(1);
    }
};
validatePath(backendPath, "Backend");
validatePath(vendorPath, "PHP Dependencies (vendor)");

// Start PHP Messaging Consumers
console.log("📩 Starting RabbitMQ consumers...");
const messagingScripts = [
    "php front_to_back_receiver.php",
    "php db_to_be_receiver.php"
    
];

messagingScripts.forEach(script => {
    exec(script, { cwd: backendPath }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error starting ${script}:`, error);
        } else {
            console.log(`✅ ${script} started successfully.`);
        }
    });
});

// Start PHP Backend Server
console.log("🖥️ Starting PHP Backend on port 8000...");
exec(`php -S 0.0.0.0:8000 -t "${backendPath}"`, (error, stdout, stderr) => {
    if (error) {
        console.error("❌ Error starting PHP backend:", error);
    } else {
        console.log("✅ PHP backend started on http://0.0.0.0:8000");
    }
});

// Start Node.js Backend (server.js in backend directory)
console.log("⚙️ Starting Node.js Backend...");

// Run `npm install` before starting `server.js`
exec("npm install", { cwd: backendPath }, (installError, installStdout, installStderr) => {
    if (installError) {
        console.error("❌ Error running npm install:", installError);
        console.error("📌 npm install output:", installStderr);
        return;
    }
    console.log("✅ npm install completed.");

    // Start `server.js`
    const serverProcess = exec("node server.js", { cwd: backendPath });

    serverProcess.stdout.on("data", (data) => {
        console.log(`📌 Node.js Output: ${data}`);
    });

    serverProcess.stderr.on("data", (data) => {
        console.error(`❌ Node.js Error: ${data}`);
    });

    serverProcess.on("exit", (code) => {
        console.log(`⚠️ Node.js backend exited with code ${code}`);
    });
});
