import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { WebSocketService } from './websocket.service';
import audioConfig from '../../audio-config.json';

export interface AudioPacket {
  headers: {
    ':message-type': string;
    ':event-type': string;
    ':content-type': string;
  };
  payload: string; // Base64 encoded PCM audio
}

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;

  private readonly sampleRate = audioConfig.sampleRate;
  private readonly channels = audioConfig.channels;
  private readonly bitsPerSample = audioConfig.bitDepth;

  constructor(private wsService: WebSocketService) {}

  async requestMicrophoneAccess(): Promise<MediaStream> {
    if (this.mediaStream) {
      return this.mediaStream;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: this.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      return this.mediaStream;
    } catch (error) {
      console.error('Microphone access denied:', error);
      throw error;
    }
  }

  startAudioCapture(): void {
    if (!this.mediaStream || this.isRecording) {
      return;
    }

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Use ScriptProcessorNode for audio processing (deprecated but widely supported)
      // Alternative: Use AudioWorkletNode for modern browsers
      const bufferSize = 4096;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, this.channels, this.channels);
      
      this.processor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array (PCM format)
        const pcmData = this.convertFloat32ToInt16(inputData);
        
        // Create AWS Medical Transcription packet format
        const audioPacket = this.createAudioPacket(pcmData);
        
        // Console log the packet as requested
        console.log('Audio Packet:', audioPacket);
        
        // Send audio packet via WebSocket if connected (ignored if not connected)
        this.wsService.sendJson(audioPacket);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      this.isRecording = true;
      
      console.log('Audio capture started');
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  }

  stopMicrophone(): void {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    console.log('Microphone stopped');
  }

  private convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp value to [-1, 1] range and convert to 16-bit integer
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private createAudioPacket(pcmData: Int16Array): AudioPacket {
    // Convert Int16Array to base64
    const base64Audio = this.arrayBufferToBase64(pcmData.buffer as ArrayBuffer);

    return {
      headers: {
        ':message-type': 'event',
        ':event-type': 'AudioEvent',
        ':content-type': `audio/pcm;rate=${this.sampleRate};channels=${this.channels}`
      },
      payload: base64Audio
    };
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | SharedArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  isMicrophoneActive(): boolean {
    return this.mediaStream !== null && this.isRecording;
  }
}

