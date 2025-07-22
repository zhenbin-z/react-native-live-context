import { SDKConfig, ServerInfo } from '../types';
import { DEFAULT_PORTS, DEFAULT_HOSTS } from '../utils/config';
import { Logger } from '../utils/logger';

interface DiscoveryResult {
  server: ServerInfo;
  responseTime: number;
}

export class ServiceDiscovery {
  private config: SDKConfig;
  private logger: Logger;
  private discoveryTimeout: number;

  constructor(config: SDKConfig) {
    this.config = config;
    this.logger = new Logger(config.logLevel || 'warn', '[ServiceDiscovery]');
    this.discoveryTimeout = config.discoveryTimeout || 5000;
  }

  async discoverServer(): Promise<ServerInfo | null> {
    this.logger.info('Starting server discovery...', {
      timeout: this.discoveryTimeout,
      autoDiscovery: this.config.autoDiscovery,
    });

    const startTime = Date.now();

    try {
      // If explicit server configuration is provided, test it first
      if (this.config.serverUrl || (this.config.serverHost && this.config.serverPort)) {
        const explicitServer = await this.testExplicitServer();
        if (explicitServer) {
          this.logger.info('Using configured server', {
            server: explicitServer.server,
            responseTime: explicitServer.responseTime,
          });
          return explicitServer.server;
        }
      }

      // If auto-discovery is disabled and explicit server failed, return null
      if (this.config.autoDiscovery === false) {
        this.logger.warn('Auto-discovery disabled and explicit server not reachable');
        return null;
      }

      // Auto-discovery: try multiple strategies
      const discoveryStrategies = [
        () => this.tryDefaultPorts(),
        () => this.tryCommonPorts(),
        () => this.scanLocalNetwork(),
      ];

      for (const strategy of discoveryStrategies) {
        const remainingTime = this.discoveryTimeout - (Date.now() - startTime);
        if (remainingTime <= 0) {
          this.logger.warn('Discovery timeout reached');
          break;
        }

        try {
          const result = await Promise.race([
            strategy(),
            this.createTimeoutPromise(remainingTime),
          ]);

          if (result) {
            this.logger.info('Server discovered via auto-discovery', {
              server: result.server,
              responseTime: result.responseTime,
              totalTime: Date.now() - startTime,
            });
            return result.server;
          }
        } catch (error) {
          this.logger.debug('Discovery strategy failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.warn('No server found during discovery', {
        totalTime: Date.now() - startTime,
      });
      return null;
    } catch (error) {
      this.logger.error('Discovery process failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        totalTime: Date.now() - startTime,
      });
      return null;
    }
  }

  private async testExplicitServer(): Promise<DiscoveryResult | null> {
    let host: string;
    let port: number;

    if (this.config.serverUrl) {
      try {
        const url = new URL(this.config.serverUrl);
        host = url.hostname;
        port = parseInt(url.port) || 8080;
      } catch (error) {
        this.logger.error('Invalid serverUrl format', { url: this.config.serverUrl });
        return null;
      }
    } else if (this.config.serverHost && this.config.serverPort) {
      host = this.config.serverHost;
      port = this.config.serverPort;
    } else {
      return null;
    }

    this.logger.debug('Testing explicit server', { host, port });
    const result = await this.testConnection(host, port);
    
    if (result) {
      return {
        server: {
          host,
          port,
          version: result.version || '1.0.0',
          capabilities: result.capabilities || ['screenshot', 'context'],
        },
        responseTime: result.responseTime,
      };
    }

    return null;
  }

  private async tryDefaultPorts(): Promise<DiscoveryResult | null> {
    this.logger.debug('Trying default ports...');
    
    const promises = DEFAULT_HOSTS.flatMap(host =>
      DEFAULT_PORTS.map(port => this.testConnectionWithResult(host, port))
    );

    const results = await Promise.allSettled(promises);
    const successful = results
      .filter((result): result is PromiseFulfilledResult<DiscoveryResult | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value!);

    // Return the fastest responding server
    if (successful.length > 0) {
      return successful.sort((a, b) => a.responseTime - b.responseTime)[0];
    }

    return null;
  }

  private async tryCommonPorts(): Promise<DiscoveryResult | null> {
    this.logger.debug('Trying common development ports...');
    
    const commonPorts = [3000, 3001, 4000, 5000, 8000, 8081, 9000];
    const promises = DEFAULT_HOSTS.flatMap(host =>
      commonPorts.map(port => this.testConnectionWithResult(host, port))
    );

    const results = await Promise.allSettled(promises);
    const successful = results
      .filter((result): result is PromiseFulfilledResult<DiscoveryResult | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value!);

    if (successful.length > 0) {
      return successful.sort((a, b) => a.responseTime - b.responseTime)[0];
    }

    return null;
  }

  private async scanLocalNetwork(): Promise<DiscoveryResult | null> {
    this.logger.debug('Scanning local network...');
    
    // Get local IP range (simplified - assumes 192.168.x.x)
    const localHosts = this.generateLocalHosts();
    const promises = localHosts.flatMap(host =>
      DEFAULT_PORTS.slice(0, 2).map(port => this.testConnectionWithResult(host, port))
    );

    const results = await Promise.allSettled(promises);
    const successful = results
      .filter((result): result is PromiseFulfilledResult<DiscoveryResult | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value!);

    if (successful.length > 0) {
      return successful.sort((a, b) => a.responseTime - b.responseTime)[0];
    }

    return null;
  }

  private generateLocalHosts(): string[] {
    // Generate common local network addresses
    const hosts: string[] = [];
    
    // Common local network ranges
    const ranges = [
      { base: '192.168.1', start: 1, end: 10 },
      { base: '192.168.0', start: 1, end: 10 },
      { base: '10.0.0', start: 1, end: 10 },
    ];

    for (const range of ranges) {
      for (let i = range.start; i <= range.end; i++) {
        hosts.push(`${range.base}.${i}`);
      }
    }

    return hosts;
  }

  private async testConnectionWithResult(host: string, port: number): Promise<DiscoveryResult | null> {
    const result = await this.testConnection(host, port);
    if (result) {
      return {
        server: {
          host,
          port,
          version: result.version || '1.0.0',
          capabilities: result.capabilities || ['screenshot', 'context'],
        },
        responseTime: result.responseTime,
      };
    }
    return null;
  }

  private async testConnection(host: string, port: number): Promise<{
    responseTime: number;
    version?: string;
    capabilities?: string[];
  } | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      try {
        const ws = new WebSocket(`ws://${host}:${port}`);
        
        const timeout = setTimeout(() => {
          ws.close();
          resolve(null);
        }, 3000); // 3 second timeout per connection

        ws.onopen = () => {
          const responseTime = Date.now() - startTime;
          clearTimeout(timeout);
          
          // Send a discovery message to get server info
          ws.send(JSON.stringify({
            type: 'discovery',
            id: `discovery-${Date.now()}`,
            timestamp: Date.now(),
          }));

          // Wait for response or timeout
          const responseTimeout = setTimeout(() => {
            ws.close();
            resolve({
              responseTime,
              version: '1.0.0',
              capabilities: ['screenshot', 'context'],
            });
          }, 1000);

          ws.onmessage = (event) => {
            clearTimeout(responseTimeout);
            try {
              const response = JSON.parse(event.data);
              ws.close();
              resolve({
                responseTime,
                version: response.version || '1.0.0',
                capabilities: response.capabilities || ['screenshot', 'context'],
              });
            } catch {
              ws.close();
              resolve({
                responseTime,
                version: '1.0.0',
                capabilities: ['screenshot', 'context'],
              });
            }
          };
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };

        ws.onclose = () => {
          clearTimeout(timeout);
        };
      } catch (error) {
        resolve(null);
      }
    });
  }

  private createTimeoutPromise(timeout: number): Promise<null> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(null), timeout);
    });
  }

  // Public method to test a specific server
  async testServer(host: string, port: number): Promise<ServerInfo | null> {
    this.logger.info('Testing specific server', { host, port });
    
    const result = await this.testConnection(host, port);
    if (result) {
      return {
        host,
        port,
        version: result.version || '1.0.0',
        capabilities: result.capabilities || ['screenshot', 'context'],
      };
    }
    
    return null;
  }

  // Get discovery statistics
  getDiscoveryStats(): {
    timeout: number;
    defaultPorts: number[];
    defaultHosts: string[];
    autoDiscoveryEnabled: boolean;
  } {
    return {
      timeout: this.discoveryTimeout,
      defaultPorts: DEFAULT_PORTS,
      defaultHosts: DEFAULT_HOSTS,
      autoDiscoveryEnabled: this.config.autoDiscovery !== false,
    };
  }
}