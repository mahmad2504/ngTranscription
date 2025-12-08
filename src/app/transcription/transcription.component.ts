import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService, ConnectionStatus } from '../websocket.service';
import { AudioService } from '../audio.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-transcription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './transcription.component.html',
  styleUrls: ['./transcription.component.css']
})
export class TranscriptionComponent implements OnInit, OnDestroy {
  networkStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  awsStatus: string = 'Not Set';
  private statusSubscription?: Subscription;

  constructor(
    private wsService: WebSocketService,
    private audioService: AudioService
  ) {}

  ngOnInit(): void {
    this.statusSubscription = this.wsService.status$.subscribe(
      (status) => {
        this.networkStatus = status;
        
        // Close microphone when network status is disconnected
        if (status === ConnectionStatus.DISCONNECTED) {
          this.audioService.stopMicrophone();
        }
      }
    );
  }

  ngOnDestroy(): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
    this.wsService.disconnect();
    this.audioService.stopMicrophone();
  }

  async connect(): Promise<void> {
    try {
      // Request microphone access first
      await this.audioService.requestMicrophoneAccess();
      
      // Start audio capture
      this.audioService.startAudioCapture();
      
      // Only connect WebSocket if microphone access succeeded
      this.wsService.connect();
    } catch (error) {
      console.error('Failed to access microphone. WebSocket connection not attempted.', error);
      // Don't attempt WebSocket connection if mic access fails
    }
  }

  disconnect(): void {
    this.wsService.disconnect();
    this.audioService.stopMicrophone();
  }

  getNetworkStatusText(): string {
    switch (this.networkStatus) {
      case ConnectionStatus.CONNECTED:
        return 'Connected';
      case ConnectionStatus.CONNECTING:
        return 'Connecting...';
      case ConnectionStatus.RECONNECTING:
        return 'Reconnecting...';
      case ConnectionStatus.ERROR:
        return 'Error';
      case ConnectionStatus.DISCONNECTED:
      default:
        return 'Disconnected';
    }
  }

  getNetworkStatusClass(): string {
    switch (this.networkStatus) {
      case ConnectionStatus.CONNECTED:
        return 'status-connected';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return 'status-connecting';
      case ConnectionStatus.ERROR:
        return 'status-error';
      case ConnectionStatus.DISCONNECTED:
      default:
        return 'status-disconnected';
    }
  }

  isConnected(): boolean {
    return this.networkStatus === ConnectionStatus.CONNECTED;
  }

  isConnecting(): boolean {
    return this.networkStatus === ConnectionStatus.CONNECTING || 
           this.networkStatus === ConnectionStatus.RECONNECTING;
  }
}

