# Angular WebSocket Application

An Angular application that manages WebSocket connections with automatic retry functionality.

## Features

- Connect/Disconnect buttons for WebSocket management
- Network status indicator showing real-time connection state
- AWS status indicator (placeholder for future implementation)
- Automatic retry mechanism (4 attempts) when connection is lost
- Exponential backoff for reconnection attempts

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

1. Start the development server:
```bash
npm start
```

2. Open your browser and navigate to `http://localhost:4200`

## WebSocket Server

The application connects to a WebSocket server running on `ws://localhost:5000`. Make sure you have a WebSocket server running on port 5000 before connecting.

## Connection States

- **Disconnected**: No connection established
- **Connecting**: Initial connection attempt in progress
- **Connected**: Successfully connected to the server
- **Reconnecting**: Attempting to reconnect after disconnection (up to 4 retries)
- **Error**: Connection error or max retries exceeded

## Retry Logic

When the WebSocket connection is lost, the application will automatically attempt to reconnect up to 4 times with exponential backoff:
- 1st retry: 1 second delay
- 2nd retry: 2 seconds delay
- 3rd retry: 4 seconds delay
- 4th retry: 8 seconds delay

Maximum delay is capped at 10 seconds.

