import { WebSocketClient } from '../../services/WebSocketClient';
import { createSDKConfig } from '../../utils/config';
import { MessageType } from '../../types';

// Mock WebSocket
const mockWebSocket = {
  readyState: WebSocket.CONNECTING,
  send: jest.fn(),
  close: jest.fn(),
  onopen: null as any,
  onmessage: null as any,
  onerror: null as any,
  onclose: null as any,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket);

// Mock timers
jest.useFakeTimers();

describe('WebSocketClient', () => {
  let client: WebSocketClient;
  let config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    config = createSDKConfig({
      retryAttempts: 3,
      discoveryTimeout: 5000,
    });
    client = new WebSocketClient(config);
    mockWebSocket.readyState = WebSocket.CONNECTING;
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const connectPromise = client.connect('ws://localhost:8080');

      // Simulate successful connection
      mockWebSocket.readyState = WebSocket.OPEN;
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await expect(connectPromise).resolves.toBeUndefined();
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:8080');
    });

    it('should reject on connection error', async () => {
      const connectPromise = client.connect('ws://localhost:8080');

      // Simulate connection error
      setTimeout(() => {
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror(new Error('Connection failed'));
        }
      }, 10);

      await expect(connectPromise).rejects.toThrow('WebSocket connection error');
    });

    it('should timeout if connection takes too long', async () => {
      const connectPromise = client.connect('ws://localhost:8080');

      // Don't trigger onopen to simulate timeout
      jest.advanceTimersByTime(6000); // Advance past timeout

      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });

    it('should not connect if already connected', async () => {
      // First connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const firstConnect = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await firstConnect;

      // Second connection attempt
      const secondConnect = client.connect('ws://localhost:8080');
      await expect(secondConnect).resolves.toBeUndefined();

      // Should only create one WebSocket instance
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      // Establish connection first
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;
    });

    it('should send message when connected', () => {
      const message = {
        type: MessageType.SCREENSHOT_REQUEST,
        id: 'test-123',
        timestamp: Date.now(),
      };

      client.send(message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should throw error when not connected', () => {
      mockWebSocket.readyState = WebSocket.CLOSED;

      const message = {
        type: MessageType.SCREENSHOT_REQUEST,
        id: 'test-123',
        timestamp: Date.now(),
      };

      expect(() => client.send(message)).toThrow('WebSocket is not connected');
    });
  });

  describe('message handling', () => {
    let messageHandler: jest.Mock;

    beforeEach(async () => {
      messageHandler = jest.fn();
      client.onMessage(messageHandler);

      // Establish connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;
    });

    it('should handle incoming messages', () => {
      const message = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'test-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      // Simulate incoming message
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: JSON.stringify(message),
        });
      }

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle invalid JSON messages gracefully', () => {
      // Simulate invalid JSON message
      if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({
          data: 'invalid-json',
        });
      }

      // Should not call message handler for invalid messages
      expect(messageHandler).not.toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    let reconnectHandler: jest.Mock;

    beforeEach(() => {
      reconnectHandler = jest.fn();
      client.onReconnect(reconnectHandler);
    });

    it('should attempt reconnection on unexpected disconnect', async () => {
      // Initial connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;

      // Simulate unexpected disconnect
      mockWebSocket.readyState = WebSocket.CLOSED;
      if (mockWebSocket.onclose) {
        mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' }); // Abnormal closure
      }

      // Fast-forward to trigger reconnection
      jest.advanceTimersByTime(1000);

      // Should attempt to create new WebSocket connection
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
    });

    it('should not reconnect on clean disconnect', async () => {
      // Initial connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;

      // Simulate clean disconnect
      mockWebSocket.readyState = WebSocket.CLOSED;
      if (mockWebSocket.onclose) {
        mockWebSocket.onclose({ code: 1000, reason: 'Normal closure' }); // Normal closure
      }

      // Fast-forward
      jest.advanceTimersByTime(5000);

      // Should not attempt reconnection
      expect(global.WebSocket).toHaveBeenCalledTimes(1);
    });

    it('should stop reconnecting after max attempts', async () => {
      // Initial connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;

      // Simulate multiple failed reconnections
      for (let i = 0; i < 5; i++) {
        mockWebSocket.readyState = WebSocket.CLOSED;
        if (mockWebSocket.onclose) {
          mockWebSocket.onclose({ code: 1006, reason: 'Connection lost' });
        }
        
        jest.advanceTimersByTime(2000);
        
        // Simulate failed reconnection
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror(new Error('Reconnection failed'));
        }
      }

      // Should have attempted reconnection up to maxReconnectAttempts (3)
      expect(global.WebSocket).toHaveBeenCalledTimes(4); // 1 initial + 3 reconnect attempts
    });
  });

  describe('heartbeat', () => {
    beforeEach(async () => {
      // Establish connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;
    });

    it('should send heartbeat messages periodically', () => {
      // Fast-forward to trigger heartbeat
      jest.advanceTimersByTime(30000);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"heartbeat"')
      );
    });

    it('should stop heartbeat on disconnect', () => {
      client.disconnect();

      // Fast-forward
      jest.advanceTimersByTime(60000);

      // Should not send heartbeat after disconnect
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should clean up resources on disconnect', async () => {
      // Establish connection
      mockWebSocket.readyState = WebSocket.OPEN;
      const connectPromise = client.connect('ws://localhost:8080');
      
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      await connectPromise;

      client.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Client disconnect');
    });
  });

  describe('connection state', () => {
    it('should report correct connection state', () => {
      expect(client.connectionState).toBe('disconnected');

      mockWebSocket.readyState = WebSocket.CONNECTING;
      expect(client.connectionState).toBe('connecting');

      mockWebSocket.readyState = WebSocket.OPEN;
      expect(client.connectionState).toBe('connected');

      mockWebSocket.readyState = WebSocket.CLOSING;
      expect(client.connectionState).toBe('closing');

      mockWebSocket.readyState = WebSocket.CLOSED;
      expect(client.connectionState).toBe('disconnected');
    });

    it('should report isConnected correctly', () => {
      mockWebSocket.readyState = WebSocket.CLOSED;
      expect(client.isConnected).toBe(false);

      mockWebSocket.readyState = WebSocket.OPEN;
      expect(client.isConnected).toBe(true);
    });
  });
});