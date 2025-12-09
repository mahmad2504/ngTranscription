/**
 * Audio Recorder Module
 * Handles recording of incoming audio packets to WAV files
 */

const fs = require('fs');
const path = require('path');

// Load audio config
const audioConfigPath = path.join(__dirname, '..', 'audio-config.json');
const audioConfig = JSON.parse(fs.readFileSync(audioConfigPath, 'utf8'));

class AudioRecorder {
    constructor() {
        // Recording state
        this.isRecording = false;
        this.recordingFile = null;
        this.recordingStream = null;
        this.recordingStartTime = null;
        this.recordingPackets = 0;
        this.recordingBytes = 0;
        this.audioFormat = {
            sampleRate: 16000,
            channels: 1,
            bitDepth: 16
        };
        this.audioDataBuffer = [];
    }

    /**
     * Write WAV file header
     */
    writeWavHeader(stream, sampleRate, channels, bitDepth, dataSize) {
        const bytesPerSample = bitDepth / 8;
        const byteRate = sampleRate * channels * bytesPerSample;
        const blockAlign = channels * bytesPerSample;
        const fileSize = 36 + dataSize; // 36 = header size, dataSize = audio data size
        
        // RIFF header
        stream.write('RIFF');
        this.writeUInt32LE(stream, fileSize);
        stream.write('WAVE');
        
        // fmt chunk
        stream.write('fmt ');
        this.writeUInt32LE(stream, 16); // fmt chunk size
        this.writeUInt16LE(stream, 1); // audio format (1 = PCM)
        this.writeUInt16LE(stream, channels);
        this.writeUInt32LE(stream, sampleRate);
        this.writeUInt32LE(stream, byteRate);
        this.writeUInt16LE(stream, blockAlign);
        this.writeUInt16LE(stream, bitDepth);
        
        // data chunk
        stream.write('data');
        this.writeUInt32LE(stream, dataSize);
    }

    /**
     * Helper function to write 32-bit little-endian integer
     */
    writeUInt32LE(stream, value) {
        const buffer = Buffer.allocUnsafe(4);
        buffer.writeUInt32LE(value, 0);
        stream.write(buffer);
    }

    /**
     * Helper function to write 16-bit little-endian integer
     */
    writeUInt16LE(stream, value) {
        const buffer = Buffer.allocUnsafe(2);
        buffer.writeUInt16LE(value, 0);
        stream.write(buffer);
    }

    /**
     * Convert array of audio samples to Buffer
     */
    samplesToBuffer(samples) {
        const buffer = Buffer.allocUnsafe(samples.length * 2);
        for (let i = 0; i < samples.length; i++) {
            // Clamp value to 16-bit signed integer range
            const sample = Math.max(-32768, Math.min(32767, samples[i]));
            buffer.writeInt16LE(sample, i * 2);
        }
        return buffer;
    }

    /**
     * Start recording audio to a WAV file
     * @param {boolean} serverRunning - Whether the server is currently running
     */
    startRecording(serverRunning = true) {
        if (this.isRecording) {
            console.log('Recording is already in progress!');
            return;
        }

        if (!serverRunning) {
            console.log('Server is not running. Cannot start recording.');
            return;
        }

        try {
            // Create recordings directory if it doesn't exist
            const recordingsDir = path.join(__dirname, 'recordings');
            if (!fs.existsSync(recordingsDir)) {
                fs.mkdirSync(recordingsDir, { recursive: true });
            }

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.recordingFile = path.join(recordingsDir, `recording-${timestamp}.wav`);

            // Initialize recording state
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            this.recordingPackets = 0;
            this.recordingBytes = 0;
            this.audioDataBuffer = [];
            this.audioFormat = {
                sampleRate: audioConfig.sampleRate,
                channels: audioConfig.channels,
                bitDepth: audioConfig.bitDepth
            };

            // Create write stream
            this.recordingStream = fs.createWriteStream(this.recordingFile, { 
                flags: 'w'
            });

            // Track if stream is ready
            let headerWritten = false;

            // Handle stream errors
            this.recordingStream.on('error', (error) => {
                console.error('Recording stream error:', error);
                this.isRecording = false;
                this.recordingStream = null;
            });

            // Wait for stream to be ready before writing header
            this.recordingStream.on('open', () => {
                if (!headerWritten) {
                    // Write placeholder header (will be updated when stopping)
                    console.log(this.audioFormat.sampleRate)
                    console.log(this.audioFormat.channels)
                    console.log(this.audioFormat.bitDepth)
                
                    this.writeWavHeader(this.recordingStream, this.audioFormat.sampleRate, 
                                       this.audioFormat.channels, this.audioFormat.bitDepth, 0);
                    headerWritten = true;
                    console.log(`\n✓ Recording started: ${path.basename(this.recordingFile)}`);
                    //console.log('Waiting for audio packets...\n');
                }
            });

            // If stream is already open (synchronous open), write header immediately
            if (this.recordingStream.writable && !headerWritten) {
                this.writeWavHeader(this.recordingStream, this.audioFormat.sampleRate, 
                                   this.audioFormat.channels, this.audioFormat.bitDepth, 0);
                headerWritten = true;
                console.log(`\n✓ Recording started: ${path.basename(this.recordingFile)}`);
                //console.log('Waiting for audio packets...\n');
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            this.isRecording = false;
            this.recordingStream = null;
            this.recordingFile = null;
        }
    }

    /**
     * Stop recording and finalize WAV file
     * @returns {Promise} Promise that resolves when recording is fully stopped
     */
    stopRecording() {
        if (!this.isRecording) {
            console.log('No recording in progress!');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                const recordingFile = this.recordingFile;
                const recordingStartTime = this.recordingStartTime;
                const recordingPackets = this.recordingPackets;

                // Mark as not recording to prevent new writes
                this.isRecording = false;

                // Wait for stream to finish writing all buffered data
                this.recordingStream.on('finish', () => {
                try {
                    console.log(`[Recording] Stream finished. Packets: ${recordingPackets}, Bytes: ${this.recordingBytes}`);
                    
                    // Read the file to update the header with correct data size
                    const fileBuffer = fs.readFileSync(recordingFile);
                    
                    console.log(`[Recording] File size after read: ${fileBuffer.length} bytes`);
                    
                    // Calculate actual data size (file size - 44 bytes header)
                    const dataSize = fileBuffer.length - 44;
                    
                    if (dataSize <= 0) {
                        console.log('\n⚠ No audio data was recorded. File contains only header.');
                        console.log(`Expected bytes: ${this.recordingBytes}, File size: ${fileBuffer.length}`);
                        console.log('This might indicate that writes were not flushed to disk.\n');
                        // Clean up
                        this.recordingStream = null;
                        this.recordingFile = null;
                        resolve();
                        return;
                    }
                    
                    // Update the file with correct header
                    const newFileBuffer = Buffer.allocUnsafe(fileBuffer.length);
                    fileBuffer.copy(newFileBuffer, 0, 0, 44); // Copy existing header
                    
                    // Update file size in RIFF header (bytes 4-7)
                    newFileBuffer.writeUInt32LE(dataSize + 36, 4);
                    
                    // Update data chunk size (bytes 40-43)
                    newFileBuffer.writeUInt32LE(dataSize, 40);
                    
                    // Copy audio data
                    fileBuffer.copy(newFileBuffer, 44, 44);
                    
                    // Write updated file
                    fs.writeFileSync(recordingFile, newFileBuffer);

                    const duration = ((Date.now() - recordingStartTime) / 1000).toFixed(2);
                    const fileSize = (fs.statSync(recordingFile).size / 1024).toFixed(2);

                    console.log(`\n✓ Recording stopped`);
                    console.log(`File: ${recordingFile}`);
                    console.log(`Duration: ${duration}s`);
                    console.log(`Packets recorded: ${recordingPackets}`);
                    console.log(`File size: ${fileSize} KB\n`);
                    
                    resolve();
                } catch (error) {
                    console.error('Error finalizing recording file:', error);
                    reject(error);
                } finally {
                    // Reset recording state
                    this.recordingStream = null;
                    this.recordingFile = null;
                    this.recordingStartTime = null;
                    this.recordingPackets = 0;
                    this.recordingBytes = 0;
                    this.audioDataBuffer = [];
                }
                });

                // Handle stream errors
                this.recordingStream.on('error', (error) => {
                    console.error('Error in recording stream during stop:', error);
                    this.isRecording = false;
                    this.recordingStream = null;
                    this.recordingFile = null;
                    reject(error);
                });

                // Close the stream (triggers 'finish' event after all data is written)
                // The 'finish' event will fire after all data has been flushed to disk
                this.recordingStream.end();
            } catch (error) {
                console.error('Error stopping recording:', error);
                this.isRecording = false;
                this.recordingStream = null;
                this.recordingFile = null;
                reject(error);
            }
        });
    }

    /**
     * Write audio packet data to recording file
     * @param {Object} packet - Audio packet with data array and format info
     */
    writeAudioPacket(packet) {
        if (!this.isRecording) {
            return;
        }

        if (!this.recordingStream) {
            console.error('Recording stream is null!');
            return;
        }

        if (!this.recordingStream.writable) {
            console.error('Recording stream is not writable!');
            return;
        }

        try {
            // Update format from first packet if needed
            if (this.recordingPackets === 0) {
                this.audioFormat.sampleRate = packet.sampleRate || audioConfig.sampleRate;
                this.audioFormat.channels = packet.channels || audioConfig.channels;
                this.audioFormat.bitDepth = packet.bitDepth || audioConfig.bitDepth;
                //console.log(`[Recording] First packet - Format: ${this.audioFormat.sampleRate}Hz, ${this.audioFormat.channels}ch, ${this.audioFormat.bitDepth}bit`);
            }

            // Convert samples to buffer and write
            if (packet.data && Array.isArray(packet.data) && packet.data.length > 0) {
                const audioBuffer = this.samplesToBuffer(packet.data);
                
                // Write the buffer - returns false if the stream wants us to wait for 'drain'
                const canContinue = this.recordingStream.write(audioBuffer);
                
                if (!canContinue) {
                    // If buffer is full, wait for drain event before continuing
                    this.recordingStream.once('drain', () => {
                        // Buffer drained, can continue writing
                    });
                }
                
                this.recordingPackets++;
                this.recordingBytes += audioBuffer.length;
                
                // Debug: log first few packets
                /*if (this.recordingPackets <= 3) {
                    console.log(`[Recording] Packet #${this.recordingPackets}: ${audioBuffer.length} bytes written (total: ${this.recordingBytes} bytes)`);
                }*/
            } else {
                // Debug: log if packet has no data
                if (this.recordingPackets === 0) {
                    console.log('Warning: Received packet with no data array or empty data');
                    console.log('Packet structure:', JSON.stringify(packet, null, 2));
                }
            }
        } catch (error) {
            console.error('Error writing audio packet:', error);
            console.error('Error stack:', error.stack);
        }
    }

    /**
     * Get recording status information
     */
    getStatus() {
        return {
            isRecording: this.isRecording,
            recordingFile: this.recordingFile,
            recordingPackets: this.recordingPackets,
            recordingBytes: this.recordingBytes
        };
    }
}

module.exports = AudioRecorder;

