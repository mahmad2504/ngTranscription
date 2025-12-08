/**
 * WebSocket Server for Audio Streaming
 * Listens on port 5000 and receives audio packets from clients
 * Supports interactive console commands: stop, restart, status, help
 */

const WebSocket = require('ws');
const readline = require('readline');

// Configuration
const PORT = 5000;
const HOST = 'localhost';

// Server state
let wss = null;
let server = null;
let isRunning = false;
let clientCount = 0;
let totalPacketsReceived = 0;
let totalBytesReceived = 0;
let startTime = null;

/**
 * Start the WebSocket server
 */
function startServer() {
    if (isRunning) {
        console.log('Server is already running!');
        return;
    }

    try {
        // Create WebSocket server
        wss = new WebSocket.Server({ 
            port: PORT,
            host: HOST
        });

        // Track server instance
        server = wss._server;

        // Handle new client connections
        wss.on('connection', (ws, req) => {
            const clientId = ++clientCount;
            const clientIp = req.socket.remoteAddress;
            
            console.log(`[Client ${clientId}] Connected from ${clientIp}`);
            
            // Track statistics for this client
            let packetCount = 0;
            let totalBytes = 0;
            let firstPacketTime = null;
            let lastPacketTime = null;

            // Handle incoming messages
            ws.on('message', (data) => {
                try {
                    // Check if message is JSON (text) or binary
                    let packet;
                    
                    if (data instanceof Buffer) {
                        // Binary data received
                        console.log(`[Client ${clientId}] Received binary data: ${data.length} bytes`);
                        // For now, just log it - you can process binary audio data here
                        return;
                    }
                    
                    // Try to parse as JSON
                    try {
                        packet = JSON.parse(data.toString());
                    } catch (e) {
                        console.log(`[Client ${clientId}] Received non-JSON text message:`, data.toString());
                        return;
                    }

                    // Handle audio packet
                    if (packet.data && Array.isArray(packet.data)) {
                        packetCount++;
                        totalPacketsReceived++;
                        const packetSize = packet.data.length * 2; // 16-bit = 2 bytes per sample
                        totalBytes += packetSize;
                        totalBytesReceived += packetSize;
                        
                        if (!firstPacketTime) {
                            firstPacketTime = Date.now();
                        }
                        lastPacketTime = Date.now();

                        // Log packet info (you can modify this to process/store the data)
                        console.log(`[Client ${clientId}] Audio packet #${packetCount}:`, {
                            timestamp: new Date(packet.timestamp).toISOString(),
                            sampleRate: packet.sampleRate,
                            channels: packet.channels,
                            format: packet.format,
                            bitDepth: packet.bitDepth,
                            samples: packet.dataLength,
                            duration: `${packet.duration.toFixed(2)}ms`,
                            size: `${(packetSize / 1024).toFixed(2)} KB`,
                            totalPackets: packetCount,
                            totalData: `${(totalBytes / 1024 / 1024).toFixed(2)} MB`
                        });

                        // For now, we're just throwing away the data (not storing it)
                        // You can add processing logic here:
                        // - Save to file
                        // - Process audio
                        // - Send to transcription service
                        // - etc.
                        
                        // Example: Log first few samples for debugging
                        if (packetCount <= 3) {
                            console.log(`[Client ${clientId}] First ${Math.min(10, packet.data.length)} samples:`, 
                                packet.data.slice(0, 10));
                        }
                    } else if (packet.type === 'audio_header') {
                        // Handle binary audio header (if using sendAudioPacketBinary)
                        console.log(`[Client ${clientId}] Received audio header:`, packet);
                    } else {
                        // Other message types
                        console.log(`[Client ${clientId}] Received message:`, packet);
                    }

                } catch (error) {
                    console.error(`[Client ${clientId}] Error processing message:`, error);
                }
            });

            // Handle client disconnection
            ws.on('close', (code, reason) => {
                const duration = lastPacketTime && firstPacketTime 
                    ? ((lastPacketTime - firstPacketTime) / 1000).toFixed(2) 
                    : 0;
                
                console.log(`[Client ${clientId}] Disconnected:`, {
                    code,
                    reason: reason.toString(),
                    totalPackets: packetCount,
                    totalData: `${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
                    duration: `${duration}s`
                });
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`[Client ${clientId}] WebSocket error:`, error);
            });

            // Send welcome message to client
            ws.send(JSON.stringify({
                type: 'welcome',
                message: 'Connected to audio streaming server',
                clientId: clientId
            }));
        });

        // Handle server errors
        wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
        });

        isRunning = true;
        startTime = Date.now();
        console.log(`\n✓ WebSocket server started and listening on ws://${HOST}:${PORT}`);
        console.log('Type "help" for available commands\n');
    } catch (error) {
        console.error('Error starting server:', error);
        isRunning = false;
    }
}

/**
 * Stop the WebSocket server
 */
function stopServer() {
    if (!isRunning) {
        console.log('Server is not running!');
        return;
    }

    return new Promise((resolve) => {
        console.log('\nStopping WebSocket server...');
        
        // Close all client connections
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.close(1000, 'Server shutting down');
            }
        });

        // Close the server
        wss.close(() => {
            isRunning = false;
            wss = null;
            server = null;
            console.log('✓ WebSocket server stopped\n');
            resolve();
        });
    });
}

/**
 * Restart the WebSocket server
 */
async function restartServer() {
    if (isRunning) {
        await stopServer();
        // Small delay before restart
        setTimeout(() => {
            startServer();
        }, 500);
    } else {
        startServer();
    }
}

/**
 * Show server status
 */
function showStatus() {
    if (!isRunning) {
        console.log('\nServer Status: STOPPED\n');
        return;
    }

    const uptime = startTime ? ((Date.now() - startTime) / 1000).toFixed(2) : 0;
    const connectedClients = wss ? wss.clients.size : 0;

    console.log('\n=== Server Status ===');
    console.log(`Status: RUNNING`);
    console.log(`Address: ws://${HOST}:${PORT}`);
    console.log(`Uptime: ${uptime}s`);
    console.log(`Connected Clients: ${connectedClients}`);
    console.log(`Total Clients (all time): ${clientCount}`);
    console.log(`Total Packets Received: ${totalPacketsReceived}`);
    console.log(`Total Data Received: ${(totalBytesReceived / 1024 / 1024).toFixed(2)} MB`);
    console.log('====================\n');
}

/**
 * Show help message
 */
function showHelp() {
    console.log('\n=== Available Commands ===');
    console.log('start     - Start the WebSocket server');
    console.log('stop      - Stop the WebSocket server');
    console.log('restart   - Restart the WebSocket server');
    console.log('status    - Show server status and statistics');
    console.log('help      - Show this help message');
    console.log('exit/quit - Exit the application');
    console.log('==========================\n');
}

/**
 * Setup interactive console interface
 */
function setupConsoleInterface() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'server> '
    });

    rl.prompt();

    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();

        switch (command) {
            case 'start':
                startServer();
                break;
            case 'stop':
                await stopServer();
                break;
            case 'restart':
                await restartServer();
                break;
            case 'status':
                showStatus();
                break;
            case 'help':
                showHelp();
                break;
            case 'exit':
            case 'quit':
                console.log('\nShutting down...');
                if (isRunning) {
                    await stopServer();
                }
                rl.close();
                process.exit(0);
                break;
            case '':
                // Empty input, just show prompt again
                break;
            default:
                console.log(`Unknown command: "${command}". Type "help" for available commands.`);
        }

        rl.prompt();
    });

    rl.on('close', () => {
        console.log('\nGoodbye!');
        process.exit(0);
    });
}

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', async () => {
    console.log('\n\nReceived interrupt signal...');
    if (isRunning) {
        await stopServer();
    }
    process.exit(0);
});

// Start the server and console interface
console.log('Audio Streaming WebSocket Server');
console.log('==================================\n');
startServer();
setupConsoleInterface();

