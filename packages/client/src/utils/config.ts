import { SDKConfig } from '../types';

// Default configuration
const DEFAULT_CONFIG: SDKConfig = {
  autoDiscovery: true,
  discoveryTimeout: 5000,
  retryAttempts: 3,
  enableInProduction: false,
  privacyMode: false,
  screenshotQuality: 0.8,
  logLevel: 'warn',
  showConnectionStatus: __DEV__,
};

// Default ports to try during discovery
export const DEFAULT_PORTS = [8080, 3001, 4000, 8081, 3000];

// Default hosts to try during discovery
export const DEFAULT_HOSTS = ['localhost', '127.0.0.1'];

/**
 * Create SDK configuration by merging user config with defaults
 */
export function createSDKConfig(userConfig: Partial<SDKConfig> = {}): SDKConfig {
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  // If serverUrl is provided, extract host and port
  if (config.serverUrl && !config.serverHost && !config.serverPort) {
    try {
      const url = new URL(config.serverUrl);
      config.serverHost = url.hostname;
      config.serverPort = parseInt(url.port) || 8080;
    } catch (error) {
      console.warn('Invalid serverUrl format, using as-is:', config.serverUrl);
    }
  }

  // If host and port are provided but no URL, construct URL
  if (config.serverHost && config.serverPort && !config.serverUrl) {
    config.serverUrl = `ws://${config.serverHost}:${config.serverPort}`;
  }

  return config;
}

/**
 * Validate SDK configuration
 */
export function validateConfig(config: SDKConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate screenshot quality
  if (config.screenshotQuality !== undefined) {
    if (config.screenshotQuality < 0 || config.screenshotQuality > 1) {
      errors.push('screenshotQuality must be between 0 and 1');
    }
  }

  // Validate discovery timeout
  if (config.discoveryTimeout !== undefined) {
    if (config.discoveryTimeout < 1000) {
      errors.push('discoveryTimeout must be at least 1000ms');
    }
  }

  // Validate retry attempts
  if (config.retryAttempts !== undefined) {
    if (config.retryAttempts < 0 || config.retryAttempts > 10) {
      errors.push('retryAttempts must be between 0 and 10');
    }
  }

  // Validate server configuration
  if (config.serverUrl) {
    try {
      const url = new URL(config.serverUrl);
      if (!['ws:', 'wss:'].includes(url.protocol)) {
        errors.push('serverUrl must use ws:// or wss:// protocol');
      }
    } catch {
      errors.push('serverUrl must be a valid WebSocket URL');
    }
  }

  if (config.serverPort !== undefined) {
    if (config.serverPort < 1 || config.serverPort > 65535) {
      errors.push('serverPort must be between 1 and 65535');
    }
  }

  // Validate log level
  if (config.logLevel && !['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    errors.push('logLevel must be one of: debug, info, warn, error');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration for different environments
 */
export function getEnvironmentConfig(): Partial<SDKConfig> {
  if (__DEV__) {
    return {
      logLevel: 'debug',
      showConnectionStatus: true,
      enableInProduction: false,
    };
  } else {
    return {
      logLevel: 'error',
      showConnectionStatus: false,
      enableInProduction: false,
    };
  }
}

/**
 * Merge environment-specific configuration
 */
export function createEnvironmentConfig(userConfig: Partial<SDKConfig> = {}): SDKConfig {
  const envConfig = getEnvironmentConfig();
  return createSDKConfig({ ...envConfig, ...userConfig });
}