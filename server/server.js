/**
 * WebSocket Server for Audio Streaming
 * Listens on port 5000 and receives audio packets from clients
 * Supports interactive console commands: stop, restart, status, help
 */

const WebSocket = require('ws');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const AudioRecorder = require('./audioRecorder');

// Load audio config
const audioConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'audio-config.json'), 'utf8'));

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

// Audio recorder instance
const audioRecorder = new AudioRecorder();


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
                    
                    //if (data instanceof Buffer) {
                        // Binary data received
                    //    console.log(`[Client ${clientId}] Received binary data: ${data.length} bytes`);
                        // For now, just log it - you can process binary audio data here
                    //    return;
                    //}
                    
                    // Try to parse as JSON
                    try {
                        packet = JSON.parse(data.toString('utf8'));
                        
                    } catch (parseError) {
                        // Not valid JSON - might be binary data
                        console.log(`[Client ${clientId}] Received non-JSON message: ${data.length} bytes`);
                        return;
                    }

                    // Handle AudioEvent packets (from audio.service.ts)
                    if (packet.headers && packet.headers[':event-type'] === 'AudioEvent') {
                        // Extract audio format from content-type header
                      
                        const contentType = packet.headers[':content-type'] || '';
                        const sampleRateMatch = contentType.match(/rate=(\d+)/);
                        const channelsMatch = contentType.match(/channels=(\d+)/);
                        
                        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) : audioConfig.sampleRate;
                        const channels = channelsMatch ? parseInt(channelsMatch[1]) : audioConfig.channels;
                        const bitDepth = audioConfig.bitDepth;
                        
                        // Decode base64 payload to get PCM audio data
                        if (!packet.payload) {
                            console.log(`[Client ${clientId}] AudioEvent received but no payload`);
                            return;
                        }
                        
                        const audioBuffer = Buffer.from(packet.payload, 'base64');
                        
                        // Convert Buffer to array of 16-bit signed integers (PCM samples)
                        const samples = [];
                        for (let i = 0; i < audioBuffer.length; i += 2) {
                            if (i + 1 < audioBuffer.length) {
                                samples.push(audioBuffer.readInt16LE(i));
                            }
                        }
                        
                        // Create packet in format expected by audioRecorder
                        const audioPacket = {
                            data: samples,
                            sampleRate: sampleRate,
                            channels: channels,
                            bitDepth: bitDepth,
                            timestamp: Date.now(),
                            dataLength: samples.length,
                            duration: (samples.length / sampleRate) * 1000 // milliseconds
                        };
                        
                        // Update statistics
                        packetCount++;
                        totalPacketsReceived++;
                        const packetSize = audioBuffer.length;
                        totalBytes += packetSize;
                        totalBytesReceived += packetSize;
                        
                        if (!firstPacketTime) {
                            firstPacketTime = Date.now();
                        }
                        lastPacketTime = Date.now();
                        //console.log(packetCount);
                        // Write to recording file if recording is active
                        audioRecorder.writeAudioPacket(audioPacket);
                        
                        // Log packet info (optional, for debugging)
                        /*if (packetCount <= 3) {
                            console.log(`[Client ${clientId}] AudioEvent packet #${packetCount}:`, {
                                samples: samples.length,
                                sampleRate: sampleRate,
                                channels: channels,
                                size: `${(packetSize / 1024).toFixed(2)} KB`,
                                duration: `${audioPacket.duration.toFixed(2)}ms`,
                                recording: audioRecorder.isRecording ? '●' : '-'
                            });
                        }*/
                        
                        return;
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
                audioRecorder.stopRecording();
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
async function stopServer() {
    if (!isRunning) {
        console.log('Server is not running!');
        return;
    }

    // Stop recording if in progress
    if (audioRecorder.isRecording) {
        console.log('Stopping active recording...');
        await audioRecorder.stopRecording();
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
    const recordingStatus = audioRecorder.getStatus();
    console.log(`Recording: ${recordingStatus.isRecording ? `ACTIVE (${recordingStatus.recordingPackets} packets, ${(recordingStatus.recordingBytes / 1024).toFixed(2)} KB)` : 'INACTIVE'}`);
    if (recordingStatus.isRecording && recordingStatus.recordingFile) {
        console.log(`Recording File: ${path.basename(recordingStatus.recordingFile)}`);
    }
    console.log('====================\n');
}

/**
 * Show help message
 */
function showHelp() {
    console.log('\n=== Available Commands ===');
    console.log('start         - Start the WebSocket server');
    console.log('stop          - Stop the WebSocket server');
    console.log('restart       - Restart the WebSocket server');
    console.log('status        - Show server status and statistics');
    console.log('startrecording - Start recording incoming audio to WAV file');
    console.log('stoprecording  - Stop recording and save WAV file');
    console.log('help          - Show this help message');
    console.log('exit/quit     - Exit the application');
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
            case 'startrecording':
                audioRecorder.startRecording(isRunning);
                break;
            case 'stoprecording':
                await audioRecorder.stopRecording();
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
        audioRecorder.stopRecording();
        console.log('\nGoodbye!');
        process.exit(0);
    });
}

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', async () => {
    console.log('\n\nReceived interrupt signal...');
    if (isRunning) {
        await stopServer(); // stopServer now handles stopping recording
    } else if (audioRecorder.isRecording) {
        // If server not running but recording is active, stop it
        await audioRecorder.stopRecording();
    }
    process.exit(0);
});

// Start the server and console interface
console.log('Audio Streaming WebSocket Server');
console.log('==================================\n');
startServer();
setupConsoleInterface();

