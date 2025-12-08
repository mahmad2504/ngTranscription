import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private readonly maxRetries = 4;
  private retryCount = 0;
  private retryTimeout: any = null;
  private readonly serverUrl = 'ws://localhost:5000';
  
  private statusSubject = new BehaviorSubject<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  public status$: Observable<ConnectionStatus> = this.statusSubject.asObservable();

  constructor() {}

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket connection already in progress');
      return;
    }

    this.retryCount = 0;
    this.attemptConnection();
  }

  private attemptConnection(): void {
    if (this.retryCount > 0) {
      this.statusSubject.next(ConnectionStatus.RECONNECTING);
    } else {
      this.statusSubject.next(ConnectionStatus.CONNECTING);
    }

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.retryCount = 0;
        this.statusSubject.next(ConnectionStatus.CONNECTED);
        this.clearRetryTimeout();
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed', event);
        this.ws = null;
        
        // Only retry if it wasn't a manual disconnect
        if (event.code !== 1000) {
          this.handleReconnection();
        } else {
          this.statusSubject.next(ConnectionStatus.DISCONNECTED);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.statusSubject.next(ConnectionStatus.ERROR);
      };

      this.ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data);
        // Handle incoming messages here if needed
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.statusSubject.next(ConnectionStatus.ERROR);
      this.handleReconnection();
    }
  }

  private handleReconnection(): void {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000); // Exponential backoff, max 10s
      
      console.log(`Attempting to reconnect (${this.retryCount}/${this.maxRetries}) in ${delay}ms`);
      
      this.retryTimeout = setTimeout(() => {
        this.attemptConnection();
      }, delay);
    } else {
      console.log('Max retry attempts reached');
      this.statusSubject.next(ConnectionStatus.DISCONNECTED);
      this.retryCount = 0;
    }
  }

  disconnect(): void {
    this.clearRetryTimeout();
    this.retryCount = 0;

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.statusSubject.next(ConnectionStatus.DISCONNECTED);
  }

  private clearRetryTimeout(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  getStatus(): ConnectionStatus {
    return this.statusSubject.value;
  }

  send(message: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }

  sendJson(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
    // Silently ignore if not connected (as per requirement)
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

