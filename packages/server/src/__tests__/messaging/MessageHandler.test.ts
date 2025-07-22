import { MessageHandler } from '../../messaging/MessageHandler';
import { WebSocketServer } from '../../websocket/WebSocketServer';
import { ServerConfig, MessageType, WSMessage } from '../../types';
import { EventEmitter } from 'events';

// Mock WebSocketServer
class MockWebSocketServer extends EventEmitter {
  clientCount = 1;
  
  sendToClient = jest.fn().mockReturnValue(true);
  getClients = jest.fn().mockReturnValue([{ id: 'client-1' }]);
}

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let mockWebSocketServer: MockWebSocketServer;
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

    mockWebSocketServer = new MockWebSocketServer();
    messageHandler = new MessageHandler(config, mockWebSocketServer as any);
  });

  afterEach(() => {
    messageHandler.cleanup();
  });

  describe('message processing', () => {
    it('should process screenshot request', async () => {
      const clientId = 'client-1';
      const message: WSMessage = {
        type: MessageType.SCREENSHOT_REQUEST,
        id: 'screenshot-123',
        timestamp: Date.now(),
      };

      // Simulate message from WebSocket server
      mockWebSocketServer.emit('message', clientId, message);

      // Should forward the request to client
      expect(mockWebSocketServer.sendToClient).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: MessageType.SCREENSHOT_REQUEST,
          id: 'screenshot-123',
        })
      );
    });

    it('should process context request', async () => {
      const clientId = 'client-1';
      const message: WSMessage = {
        type: MessageType.CONTEXT_REQUEST,
        id: 'context-123',
        timestamp: Date.now(),
      };

      mockWebSocketServer.emit('message', clientId, message);

      expect(mockWebSocketServer.sendToClient).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: MessageType.CONTEXT_REQUEST,
          id: 'context-123',
        })
      );
    });

    it('should process command', async () => {
      const clientId = 'client-1';
      const message: WSMessage = {
        type: MessageType.COMMAND,
        id: 'command-123',
        timestamp: Date.now(),
        data: {
          command: 'test-command',
          params: { key: 'value' },
        },
      };

      mockWebSocketServer.emit('message', clientId, message);

      expect(mockWebSocketServer.sendToClient).toHaveBeenCalledWith(
        clientId,
        message
      );
    });

    it('should handle unknown message types', async () => {
      const clientId = 'client-1';
      const message: WSMessage = {
        type: 'unknown-type' as any,
        id: 'unknown-123',
        timestamp: Date.now(),
      };

      mockWebSocketServer.emit('message', clientId, message);

      expect(mockWebSocketServer.sendToClient).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: MessageType.ERROR,
          error: expect.objectContaining({
            code: 'UNKNOWN_MESSAGE_TYPE',
          }),
        })
      );
    });
  });

  describe('response handling', () => {
    it('should handle screenshot response', async () => {
      const clientId = 'client-1';
      const response: WSMessage = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockWebSocketServer.emit('message', clientId, response);

      // Should not send any response back for response messages
      expect(mockWebSocketServer.sendToClient).not.toHaveBeenCalled();
    });

    it('should handle context response', async () => {
      const clientId = 'client-1';
      const response: WSMessage = {
        type: MessageType.CONTEXT_RESPONSE,
        id: 'context-123',
        timestamp: Date.now(),
        data: { currentRoute: 'Home' },
      };

      mockWebSocketServer.emit('message', clientId, response);

      expect(mockWebSocketServer.sendToClient).not.toHaveBeenCalled();
    });

    it('should handle error messages', async () => {
      const clientId = 'client-1';
      const errorMessage: WSMessage = {
        type: MessageType.ERROR,
        id: 'error-123',
        timestamp: Date.now(),
        error: {
          code: 'SCREENSHOT_FAILED',
          message: 'Permission denied',
        },
      };

      mockWebSocketServer.emit('message', clientId, errorMessage);

      expect(mockWebSocketServer.sendToClient).not.toHaveBeenCalled();
    });
  });

  describe('client disconnection', () => {
    it('should clean up pending requests when client disconnects', async () => {
      const clientId = 'client-1';
      
      // Start a request that will be pending
      const requestPromise = messageHandler.requestScreenshot(clientId);
      
      // Simulate client disconnect
      mockWebSocketServer.emit('clientDisconnected', clientId);
      
      // The request should be rejected
      await expect(requestPromise).rejects.toThrow('Client disconnected');
    });
  });

  describe('public API methods', () => {
    it('should request screenshot from client', async () => {
      const clientId = 'client-1';
      
      // Mock the response
      setTimeout(() => {
        const response: WSMessage = {
          type: MessageType.SCREENSHOT_RESPONSE,
          id: 'screenshot-123',
          timestamp: Date.now(),
          data: 'base64-image-data',
        };
        mockWebSocketServer.emit('message', clientId, response);
      }, 10);

      const result = await messageHandler.requestScreenshot(clientId);
      
      expect(result.type).toBe(MessageType.SCREENSHOT_RESPONSE);
      expect(result.data).toBe('base64-image-data');
    });

    it('should request context from client', async () => {
      const clientId = 'client-1';
      
      setTimeout(() => {
        const response: WSMessage = {
          type: MessageType.CONTEXT_RESPONSE,
          id: 'context-123',
          timestamp: Date.now(),
          data: { currentRoute: 'Home' },
        };
        mockWebSocketServer.emit('message', clientId, response);
      }, 10);

      const result = await messageHandler.requestContext(clientId);
      
      expect(result.type).toBe(MessageType.CONTEXT_RESPONSE);
      expect(result.data).toEqual({ currentRoute: 'Home' });
    });

    it('should send command to client', async () => {
      const clientId = 'client-1';
      
      const result = await messageHandler.sendCommand('test-command', { key: 'value' }, clientId);
      
      expect(mockWebSocketServer.sendToClient).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          type: MessageType.COMMAND,
          data: {
            command: 'test-command',
            params: { key: 'value' },
          },
        })
      );
      
      expect(result.type).toBe('command_sent');
    });

    it('should handle no available clients', async () => {
      mockWebSocketServer.getClients.mockReturnValue([]);
      
      await expect(messageHandler.requestScreenshot()).rejects.toThrow(
        'No clients available for screenshot request'
      );
    });

    it('should timeout requests', async () => {
      const clientId = 'client-1';
      
      // Don't send any response to simulate timeout
      await expect(messageHandler.requestScreenshot(clientId)).rejects.toThrow(
        'Request timeout after 5000ms'
      );
    }, 6000);
  });

  describe('custom processors', () => {
    it('should allow registering custom message processors', async () => {
      const customHandler = jest.fn().mockResolvedValue({
        type: 'custom_response' as any,
        id: 'custom-123',
        timestamp: Date.now(),
        data: 'custom-data',
      });

      messageHandler.registerProcessor('custom_type' as any, customHandler);

      const clientId = 'client-1';
      const message: WSMessage = {
        type: 'custom_type' as any,
        id: 'custom-123',
        timestamp: Date.now(),
      };

      mockWebSocketServer.emit('message', clientId, message);

      expect(customHandler).toHaveBeenCalledWith(clientId, message);
    });
  });

  describe('statistics', () => {
    it('should provide handler statistics', () => {
      const stats = messageHandler.getStats();
      
      expect(stats).toHaveProperty('processorsCount');
      expect(stats).toHaveProperty('pendingRequestsCount');
      expect(stats).toHaveProperty('availableClients');
      expect(typeof stats.processorsCount).toBe('number');
      expect(typeof stats.pendingRequestsCount).toBe('number');
      expect(typeof stats.availableClients).toBe('number');
    });
  });
});