import WebSocket from 'ws';
import { WebSocketServer } from '../../websocket/WebSocketServer';
import { ServerConfig, MessageType } from '../../types';

// Mock WebSocket Server
jest.mock('ws');

const mockWebSocketServer = {
  on: jest.fn(),
  close: jest.fn(),
  clients: new Set(),
};

const mockWebSocket = {
  readyState: WebSocket.OPEN,
  send: jest.fn(),
  close: jest.fn(),
  on: jest.fn(),
  ping: jest.fn(),
  OPEN: 1,
  CLOSED: 3,
};

(WebSocket.Server as jest.Mock).mockImplementation(() => mockWebSocketServer);

describe('WebSocketServer', () => {
  let server: WebSocketServer;
  let config: ServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      websocket: {
        port: 8080,
        host: 'localhost',
        maxConnections: 100,
        heartbeatInterval: 30000,
      },
      mcp: {
        port: 8081,
        tools: ['screenshot', 'context'],
        timeout: 5000,
      },
      cache: {
        maxScreenshots: 10,
        maxAge: 300000,
      },
      security: {
        allowedOrigins: ['*'],
        enableCORS: true,
      },
    };

    server = new WebSocketServer(config);
  });

  describe('start', () => {
    it('should start server successfully', async () => {
      const startPromise = server.start();

      // Simulate successful server start
      setTimeout(() => {
        const onHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection');
        if (onHandler) {
          // Server started successfully
        }
      }, 10);

      await expect(startPromise).resolves.toBeUndefined();
      expect(WebSocket.Server).toHaveBeenCalledWith({
        port: 8080,
        host: 'localhost',
        maxPayload: 50 * 1024 * 1024,
      });
    });

    it('should not start if already running', async () => {
      await server.start();
      
      // Try to start again
      await server.start();
      
      // Should only create one WebSocket server
      expect(WebSocket.Server).toHaveBeenCalledTimes(1);
    });

    it('should handle start errors', async () => {
      (WebSocket.Server as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Port already in use');
      });

      await expect(server.start()).rejects.toThrow('WebSocket server startup failed');
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should stop server successfully', async () => {
      mockWebSocketServer.close.mockImplementationOnce((callback) => {
        callback();
      });

      await expect(server.stop()).resolves.toBeUndefined();
      expect(mockWebSocketServer.close).toHaveBeenCalled();
    });

    it('should handle stop errors', async () => {
      mockWebSocketServer.close.mockImplementationOnce((callback) => {
        callback(new Error('Failed to close'));
      });

      await expect(server.stop()).rejects.toThrow('WebSocket server shutdown failed');
    });
  });

  describe('client management', () => {
    let connectionHandler: (socket: any, request: any) => void;

    beforeEach(async () => {
      await server.start();
      
      // Get the connection handler
      const onCall = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection');
      connectionHandler = onCall[1];
    });

    it('should handle new client connections', () => {
      const mockSocket = { ...mockWebSocket };
      const mockRequest = {
        headers: { 'user-agent': 'React Native/1.0' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      connectionHandler(mockSocket, mockRequest);

      expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(server.clientCount).toBe(1);
    });

    it('should send welcome message to new clients', () => {
      const mockSocket = { ...mockWebSocket };
      const mockRequest = {
        headers: { 'user-agent': 'React Native/1.0' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      connectionHandler(mockSocket, mockRequest);

      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"welcome"')
      );
    });

    it('should handle client disconnection', () => {
      const mockSocket = { ...mockWebSocket };
      const mockRequest = {
        headers: { 'user-agent': 'React Native/1.0' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      connectionHandler(mockSocket, mockRequest);
      expect(server.clientCount).toBe(1);

      // Simulate client disconnect
      const closeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'close')[1];
      closeHandler(1000, 'Normal closure');

      expect(server.clientCount).toBe(0);
    });
  });

  describe('message handling', () => {
    let connectionHandler: (socket: any, request: any) => void;
    let messageHandler: (data: Buffer) => void;
    let mockSocket: any;

    beforeEach(async () => {
      await server.start();
      
      connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      mockSocket = { ...mockWebSocket };
      const mockRequest = {
        headers: { 'user-agent': 'React Native/1.0' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      connectionHandler(mockSocket, mockRequest);
      messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    });

    it('should handle valid messages', (done) => {
      const testMessage = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'test-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      server.on('message', (clientId, message) => {
        expect(message).toEqual(testMessage);
        done();
      });

      messageHandler(Buffer.from(JSON.stringify(testMessage)));
    });

    it('should handle heartbeat messages', () => {
      const heartbeatMessage = {
        type: 'heartbeat',
        id: 'heartbeat-123',
        timestamp: Date.now(),
      };

      messageHandler(Buffer.from(JSON.stringify(heartbeatMessage)));

      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"heartbeat_ack"')
      );
    });

    it('should handle invalid JSON messages', () => {
      messageHandler(Buffer.from('invalid-json'));

      expect(mockSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });
  });

  describe('sendToClient', () => {
    let clientId: string;

    beforeEach(async () => {
      await server.start();
      
      const connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      const mockSocket = { ...mockWebSocket };
      const mockRequest = {
        headers: { 'user-agent': 'React Native/1.0' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      connectionHandler(mockSocket, mockRequest);
      
      // Get the client ID from the welcome message
      const welcomeCall = mockSocket.send.mock.calls[0];
      const welcomeMessage = JSON.parse(welcomeCall[0]);
      clientId = welcomeMessage.data.clientId;
    });

    it('should send message to specific client', () => {
      const message = {
        type: MessageType.SCREENSHOT_REQUEST,
        id: 'test-123',
        timestamp: Date.now(),
      };

      const result = server.sendToClient(clientId, message);

      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should return false for non-existent client', () => {
      const message = {
        type: MessageType.SCREENSHOT_REQUEST,
        id: 'test-123',
        timestamp: Date.now(),
      };

      const result = server.sendToClient('non-existent-client', message);

      expect(result).toBe(false);
    });
  });

  describe('broadcast', () => {
    it('should broadcast message to all clients', async () => {
      await server.start();
      
      // Add multiple mock clients
      const connectionHandler = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      for (let i = 0; i < 3; i++) {
        const mockSocket = { ...mockWebSocket, send: jest.fn() };
        const mockRequest = {
          headers: { 'user-agent': `Client-${i}` },
          socket: { remoteAddress: '127.0.0.1' },
        };
        connectionHandler(mockSocket, mockRequest);
      }

      const message = {
        type: MessageType.SCREENSHOT_REQUEST,
        id: 'broadcast-123',
        timestamp: Date.now(),
      };

      const sentCount = server.broadcast(message);

      expect(sentCount).toBe(3);
    });
  });

  describe('server stats', () => {
    it('should provide server statistics', async () => {
      const stats = server.getServerStats();

      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('clientCount');
      expect(stats).toHaveProperty('port');
      expect(stats).toHaveProperty('host');
      expect(stats).toHaveProperty('uptime');
    });
  });
});