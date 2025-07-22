import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ServerConfig, WSMessage, MessageType, ClientConnection } from '../types';
import { Logger } from '../utils/Logger';

export class WebSocketServer extends EventEmitter {
  private server: WebSocket.Server | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private config: ServerConfig;
  private logger: Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
    this.logger = new Logger('info', '[WebSocketServer]');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('WebSocket server is already running');
      return;
    }

    try {
      this.logger.info('Starting WebSocket server', {
        port: this.config.websocket.port,
        host: this.config.websocket.host,
      });

      this.server = new WebSocket.Server({
        port: this.config.websocket.port,
        host: this.config.websocket.host,
        maxPayload: 50 * 1024 * 1024, // 50MB max payload for large screenshots
      });

      this.setupServerEventHandlers();
      this.startHeartbeat();

      this.isRunning = true;
      this.logger.info('WebSocket server started successfully', {
        port: this.config.websocket.port,
        host: this.config.websocket.host,
      });

      this.emit('started');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start WebSocket server', { error: errorMessage });
      throw new Error(`WebSocket server startup failed: ${errorMessage}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('WebSocket server is not running');
      return;
    }

    this.logger.info('Stopping WebSocket server');

    try {
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all client connections
      for (const [clientId, connection] of this.clients) {
        this.logger.debug('Closing client connection', { clientId });
        connection.socket.close(1000, 'Server shutdown');
      }
      this.clients.clear();

      // Close server
      if (this.server) {
        await new Promise<void>((resolve, reject) => {
          this.server!.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        this.server = null;
      }

      this.isRunning = false;
      this.logger.info('WebSocket server stopped successfully');
      this.emit('stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error stopping WebSocket server', { error: errorMessage });
      throw new Error(`WebSocket server shutdown failed: ${errorMessage}`);
    }
  }

  sendToClient(clientId: string, message: WSMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      this.logger.warn('Client not found', { clientId });
      return false;
    }

    if (client.socket.readyState !== WebSocket.OPEN) {
      this.logger.warn('Client connection not open', { clientId, readyState: client.socket.readyState });
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      client.socket.send(messageStr);
      
      this.logger.debug('Message sent to client', {
        clientId,
        messageType: message.type,
        messageId: message.id,
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to send message to client', {
        clientId,
        error: errorMessage,
      });
      return false;
    }
  }

  broadcast(message: WSMessage, excludeClientId?: string): number {
    let sentCount = 0;
    
    for (const [clientId, client] of this.clients) {
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    this.logger.debug('Message broadcasted', {
      messageType: message.type,
      messageId: message.id,
      sentCount,
      totalClients: this.clients.size,
    });

    return sentCount;
  }

  private setupServerEventHandlers(): void {
    if (!this.server) return;

    this.server.on('connection', (socket, request) => {
      const clientId = this.generateClientId();
      const userAgent = request.headers['user-agent'] || 'Unknown';
      const remoteAddress = request.socket.remoteAddress || 'Unknown';

      this.logger.info('New client connected', {
        clientId,
        userAgent,
        remoteAddress,
      });

      const connection: ClientConnection = {
        id: clientId,
        socket,
        lastHeartbeat: Date.now(),
        metadata: {
          userAgent,
          platform: this.extractPlatform(userAgent),
          version: this.extractVersion(userAgent),
        },
      };

      this.clients.set(clientId, connection);
      this.setupClientEventHandlers(connection);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome' as any,
        id: `welcome-${Date.now()}`,
        timestamp: Date.now(),
        data: {
          clientId,
          serverVersion: '1.0.0',
          capabilities: ['screenshot', 'context', 'command'],
        },
      });

      this.emit('clientConnected', clientId, connection.metadata);
    });

    this.server.on('error', (error) => {
      this.logger.error('WebSocket server error', { error: error.message });
      this.emit('error', error);
    });

    this.server.on('close', () => {
      this.logger.info('WebSocket server closed');
      this.isRunning = false;
      this.emit('closed');
    });
  }

  private setupClientEventHandlers(connection: ClientConnection): void {
    const { id: clientId, socket } = connection;

    socket.on('message', (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        
        this.logger.debug('Message received from client', {
          clientId,
          messageType: message.type,
          messageId: message.id,
        });

        // Update last heartbeat for any message
        connection.lastHeartbeat = Date.now();

        // Handle heartbeat messages
        if (message.type === 'heartbeat' as any) {
          this.sendToClient(clientId, {
            type: 'heartbeat_ack' as any,
            id: `heartbeat_ack-${Date.now()}`,
            timestamp: Date.now(),
          });
          return;
        }

        // Emit message for handling by other components
        this.emit('message', clientId, message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Failed to parse message from client', {
          clientId,
          error: errorMessage,
        });

        this.sendToClient(clientId, {
          type: MessageType.ERROR,
          id: `error-${Date.now()}`,
          timestamp: Date.now(),
          error: {
            code: 'INVALID_MESSAGE',
            message: 'Failed to parse message',
          },
        });
      }
    });

    socket.on('close', (code, reason) => {
      this.logger.info('Client disconnected', {
        clientId,
        code,
        reason: reason.toString(),
      });

      this.clients.delete(clientId);
      this.emit('clientDisconnected', clientId, code, reason.toString());
    });

    socket.on('error', (error) => {
      this.logger.error('Client socket error', {
        clientId,
        error: error.message,
      });

      this.emit('clientError', clientId, error);
    });

    socket.on('pong', () => {
      connection.lastHeartbeat = Date.now();
      this.logger.debug('Pong received from client', { clientId });
    });
  }

  private startHeartbeat(): void {
    const interval = this.config.websocket.heartbeatInterval || 30000;
    
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = interval * 2; // Allow 2x interval for timeout

      for (const [clientId, connection] of this.clients) {
        if (now - connection.lastHeartbeat > timeout) {
          this.logger.warn('Client heartbeat timeout, closing connection', {
            clientId,
            lastHeartbeat: new Date(connection.lastHeartbeat).toISOString(),
          });
          
          connection.socket.close(1000, 'Heartbeat timeout');
          this.clients.delete(clientId);
          continue;
        }

        // Send ping
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.ping();
        }
      }
    }, interval);

    this.logger.debug('Heartbeat started', { interval });
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractPlatform(userAgent: string): string {
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      return 'iOS';
    } else if (userAgent.includes('Android')) {
      return 'Android';
    } else if (userAgent.includes('React Native')) {
      return 'React Native';
    }
    return 'Unknown';
  }

  private extractVersion(userAgent: string): string {
    // Try to extract version from user agent
    const versionMatch = userAgent.match(/Version\/(\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : '1.0.0';
  }

  // Public getters and utility methods
  get isActive(): boolean {
    return this.isRunning;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  getClients(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  getClient(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  getServerStats(): {
    isRunning: boolean;
    clientCount: number;
    port: number;
    host: string;
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      port: this.config.websocket.port,
      host: this.config.websocket.host,
      uptime: this.isRunning ? Date.now() : 0,
    };
  }
}