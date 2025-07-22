import { createSDKConfig, validateConfig } from '../../utils/config';

describe('Config Utils', () => {
  describe('createSDKConfig', () => {
    it('should create default config when no user config provided', () => {
      const config = createSDKConfig();
      
      expect(config.autoDiscovery).toBe(true);
      expect(config.discoveryTimeout).toBe(5000);
      expect(config.retryAttempts).toBe(3);
      expect(config.enableInProduction).toBe(false);
      expect(config.screenshotQuality).toBe(0.8);
      expect(config.logLevel).toBe('warn');
    });

    it('should merge user config with defaults', () => {
      const userConfig = {
        autoDiscovery: false,
        screenshotQuality: 0.5,
        logLevel: 'debug' as const,
      };
      
      const config = createSDKConfig(userConfig);
      
      expect(config.autoDiscovery).toBe(false);
      expect(config.screenshotQuality).toBe(0.5);
      expect(config.logLevel).toBe('debug');
      expect(config.discoveryTimeout).toBe(5000); // Should keep default
    });

    it('should extract host and port from serverUrl', () => {
      const config = createSDKConfig({
        serverUrl: 'ws://192.168.1.100:8080',
      });
      
      expect(config.serverHost).toBe('192.168.1.100');
      expect(config.serverPort).toBe(8080);
    });

    it('should construct serverUrl from host and port', () => {
      const config = createSDKConfig({
        serverHost: 'localhost',
        serverPort: 3001,
      });
      
      expect(config.serverUrl).toBe('ws://localhost:3001');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = createSDKConfig();
      const result = validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid screenshot quality', () => {
      const config = createSDKConfig({ screenshotQuality: 1.5 });
      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('screenshotQuality must be between 0 and 1');
    });

    it('should reject invalid discovery timeout', () => {
      const config = createSDKConfig({ discoveryTimeout: 500 });
      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('discoveryTimeout must be at least 1000ms');
    });

    it('should reject invalid server URL protocol', () => {
      const config = createSDKConfig({ serverUrl: 'http://localhost:8080' });
      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('serverUrl must use ws:// or wss:// protocol');
    });

    it('should reject invalid log level', () => {
      const config = createSDKConfig({ logLevel: 'invalid' as any });
      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('logLevel must be one of: debug, info, warn, error');
    });
  });
});