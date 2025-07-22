import { SDKConfig, WSMessage } from '../types';
import { Logger } from '../utils/logger';

type MessageHandler = (message: WSMessage) => void;
type ErrorHandler = (error: Error) => void;
type ConnectionHandler = () => void;

export class WebSocketClient {
  private config: SDKConfig;
  private logger: Logger;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;

  // Event handlers
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private disconnectHandlers: ConnectionHandler[] = [];
  private reconnectHandlers: ConnectionHandler[] = [];

  constructor(config: SDKConfig) {
    this.config = config;
    this.logger = new Logger(config.logLevel || 'warn', '[WebSocketClient]');
    this.maxReconnectAttempts = config.retryAttempts || 3;
  }

  async connect(url: string): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      this.logger.debug('Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    this.logger.info('Connecting to WebSocket server', { url });

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          if (this.ws) {
            this.ws.close();
          }
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, this.config.discoveryTimeout || 5000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.logger.info('WebSocket connected');
          this.startHeartbeat();
          this.flushMessageQueue(); // Send any queued messages
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data);
            this.logger.debug('Received message', { type: message.type, id: message.id });
            this.messageHandlers.forEach(handler => handler(message));
          } catch (error) {
            this.logger.error('Failed to parse message', { error: error instanceof Error ? error.message : 'Unknown error' });
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.logger.error('WebSocket error', { error });
          const errorObj = new Error('WebSocket connection error');
          this.errorHandlers.forEach(handler => handler(errorObj));
          reject(errorObj);
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.stopHeartbeat();
          this.logger.info('WebSocket disconnected', { code: event.code, reason: event.reason });
          this.disconnectHandlers.forEach(handler => handler());
          
          // Attempt reconnection if not a clean close
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect(url);
          }
        };
      } catch (error) {
        this.isConnecting = false;
        const errorObj = error instanceof Error ? error : new Error('Unknown connection error');
        reject(errorObj);
      }
    });
  }

  disconnect(): void {
    this.logger.info('Disconnecting WebSocket');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }

  send(message: WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const messageStr = JSON.stringify(message);
    this.logger.debug('Sending message', { type: message.type, id: message.id });
    this.ws.send(messageStr);
  }

  // Event handler registration
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  onDisconnect(handler: ConnectionHandler): void {
    this.disconnectHandlers.push(handler);
  }

  onReconnect(handler: ConnectionHandler): void {
    this.reconnectHandlers.push(handler);
  }

  removeAllListeners(): void {
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.disconnectHandlers = [];
    this.reconnectHandlers = [];
  }

  // Private methods
  private scheduleReconnect(url: string): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
    
    this.logger.info('Scheduling reconnection', { 
      attempt: this.reconnectAttempts, 
      maxAttempts: this.maxReconnectAttempts, 
      delay 
    });

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(url);
        this.flushMessageQueue(); // Send any queued messages after reconnection
        this.reconnectHandlers.forEach(handler => handler());
      } catch (error) {
        this.logger.error('Reconnection failed', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'heartbeat' as any,
          id: `heartbeat-${Date.now()}`,
          timestamp: Date.now(),
        });
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Message queue for offline messages
  private messageQueue: WSMessage[] = [];
  private maxQueueSize = 100;

  // Queue message when offline, send when reconnected
  sendOrQueue(message: WSMessage): void {
    if (this.isConnected) {
      this.send(message);
    } else {
      this.queueMessage(message);
    }
  }

  private queueMessage(message: WSMessage): void {
    this.messageQueue.push(message);
    
    // Limit queue size
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
      this.logger.warn('Message queue full, dropping oldest message');
    }
    
    this.logger.debug('Message queued for later delivery', { 
      type: message.type, 
      id: message.id,
      queueSize: this.messageQueue.length 
    });
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    this.logger.info('Flushing message queue', { count: this.messageQueue.length });
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const message of messages) {
      try {
        this.send(message);
      } catch (error) {
        this.logger.error('Failed to send queued message', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: message.id 
        });
        // Re-queue failed message
        this.queueMessage(message);
        break; // Stop processing if send fails
      }
    }
  }

  // Get connection statistics
  getConnectionStats(): {
    isConnected: boolean;
    connectionState: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    queuedMessages: number;
  } {
    return {
      isConnected: this.isConnected,
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      queuedMessages: this.messageQueue.length,
    };
  }

  // Getters
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}