import { ServiceDiscovery } from '../../services/ServiceDiscovery';
import { createSDKConfig } from '../../utils/config';

// Mock WebSocket
const mockWebSocket = {
  readyState: 1,
  send: jest.fn(),
  close: jest.fn(),
  onopen: null as any,
  onmessage: null as any,
  onerror: null as any,
  onclose: null as any,
};

global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket);

describe('ServiceDiscovery', () => {
  let serviceDiscovery: ServiceDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createSDKConfig();
    serviceDiscovery = new ServiceDiscovery(config);
  });

  describe('discoverServer', () => {
    it('should use explicit server configuration when provided', async () => {
      const config = createSDKConfig({
        serverHost: 'localhost',
        serverPort: 8080,
        autoDiscovery: false,
      });
      
      serviceDiscovery = new ServiceDiscovery(config);

      // Mock successful connection
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      const result = await serviceDiscovery.discoverServer();

      expect(result).toEqual({
        host: 'localhost',
        port: 8080,
        version: '1.0.0',
        capabilities: ['screenshot', 'context'],
      });
    });

    it('should return null when explicit server is not reachable and auto-discovery is disabled', async () => {
      const config = createSDKConfig({
        serverHost: 'unreachable-host',
        serverPort: 9999,
        autoDiscovery: false,
      });
      
      serviceDiscovery = new ServiceDiscovery(config);

      // Mock failed connection
      setTimeout(() => {
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror({});
        }
      }, 10);

      const result = await serviceDiscovery.discoverServer();

      expect(result).toBeNull();
    });

    it('should attempt auto-discovery when explicit server fails', async () => {
      const config = createSDKConfig({
        serverHost: 'unreachable-host',
        serverPort: 9999,
        autoDiscovery: true,
        discoveryTimeout: 1000,
      });
      
      serviceDiscovery = new ServiceDiscovery(config);

      // Mock first connection fails, second succeeds
      let connectionAttempts = 0;
      (global.WebSocket as jest.Mock).mockImplementation(() => {
        connectionAttempts++;
        if (connectionAttempts === 1) {
          // First connection fails
          setTimeout(() => {
            if (mockWebSocket.onerror) {
              mockWebSocket.onerror({});
            }
          }, 10);
        } else {
          // Subsequent connections succeed
          setTimeout(() => {
            if (mockWebSocket.onopen) {
              mockWebSocket.onopen({});
            }
          }, 10);
        }
        return mockWebSocket;
      });

      const result = await serviceDiscovery.discoverServer();

      expect(result).toBeTruthy();
      expect(connectionAttempts).toBeGreaterThan(1);
    });

    it('should respect discovery timeout', async () => {
      const config = createSDKConfig({
        autoDiscovery: true,
        discoveryTimeout: 100, // Very short timeout
      });
      
      serviceDiscovery = new ServiceDiscovery(config);

      // Mock all connections to timeout
      (global.WebSocket as jest.Mock).mockImplementation(() => {
        // Never call onopen to simulate timeout
        return mockWebSocket;
      });

      const startTime = Date.now();
      const result = await serviceDiscovery.discoverServer();
      const endTime = Date.now();

      expect(result).toBeNull();
      expect(endTime - startTime).toBeLessThan(500); // Should timeout quickly
    });
  });

  describe('testServer', () => {
    it('should test a specific server', async () => {
      // Mock successful connection
      setTimeout(() => {
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({});
        }
      }, 10);

      const result = await serviceDiscovery.testServer('localhost', 8080);

      expect(result).toEqual({
        host: 'localhost',
        port: 8080,
        version: '1.0.0',
        capabilities: ['screenshot', 'context'],
      });
    });

    it('should return null for unreachable server', async () => {
      // Mock failed connection
      setTimeout(() => {
        if (mockWebSocket.onerror) {
          mockWebSocket.onerror({});
        }
      }, 10);

      const result = await serviceDiscovery.testServer('unreachable', 9999);

      expect(result).toBeNull();
    });
  });

  describe('getDiscoveryStats', () => {
    it('should return discovery configuration stats', () => {
      const stats = serviceDiscovery.getDiscoveryStats();

      expect(stats).toHaveProperty('timeout');
      expect(stats).toHaveProperty('defaultPorts');
      expect(stats).toHaveProperty('defaultHosts');
      expect(stats).toHaveProperty('autoDiscoveryEnabled');
      expect(Array.isArray(stats.defaultPorts)).toBe(true);
      expect(Array.isArray(stats.defaultHosts)).toBe(true);
    });
  });
});