import { EventEmitter } from 'events';
import { ServerConfig } from '../types';
import { Logger } from '../utils/Logger';
import { WebSocketServer } from '../websocket/WebSocketServer';
import { MessageHandler } from '../messaging/MessageHandler';
import { ScreenshotService } from '../services/ScreenshotService';
import { ContextService } from '../services/ContextService';
import { MCPServer } from '../mcp/MCPServer';

export class AIScreenshotServer extends EventEmitter {
  private config: ServerConfig;
  private logger: Logger;
  
  // Core services
  private webSocketServer: WebSocketServer;
  private messageHandler: MessageHandler;
  private screenshotService: ScreenshotService;
  private contextService: ContextService;
  private mcpServer: MCPServer;
  
  private isRunning = false;
  private startTime = 0;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
    this.logger = new Logger('info', '[AIScreenshotServer]');
    
    this.initializeServices();
    this.setupEventHandlers();
  }

  private initializeServices(): void {
    this.logger.info('Initializing AI Screenshot Server services');

    // Initialize WebSocket server
    this.webSocketServer = new WebSocketServer(this.config);

    // Initialize message handler
    this.messageHandler = new MessageHandler(this.config, this.webSocketServer);

    // Initialize services
    this.screenshotService = new ScreenshotService(this.config, this.messageHandler);
    this.contextService = new ContextService(this.config, this.messageHandler);

    // Initialize MCP server
    this.mcpServer = new MCPServer(
      this.config,
      this.messageHandler,
      this.screenshotService,
      this.contextService
    );

    this.logger.info('All services initialized');
  }

  private setupEventHandlers(): void {
    // WebSocket server events
    this.webSocketServer.on('started', () => {
      this.logger.info('WebSocket server started');
      this.emit('websocket:started');
    });

    this.webSocketServer.on('stopped', () => {
      this.logger.info('WebSocket server stopped');
      this.emit('websocket:stopped');
    });

    this.webSocketServer.on('clientConnected', (clientId, metadata) => {
      this.logger.info('Client connected', { clientId, metadata });
      this.emit('client:connected', clientId, metadata);
    });

    this.webSocketServer.on('clientDisconnected', (clientId, code, reason) => {
      this.logger.info('Client disconnected', { clientId, code, reason });
      this.emit('client:disconnected', clientId, code, reason);
    });

    this.webSocketServer.on('error', (error) => {
      this.logger.error('WebSocket server error', { error: error.message });
      this.emit('error', error);
    });

    // Handle process signals for graceful shutdown
    process.on('SIGINT', () => {
      this.logger.info('Received SIGINT, shutting down gracefully');
      this.stop().then(() => {
        process.exit(0);
      }).catch((error) => {
        this.logger.error('Error during shutdown', { error });
        process.exit(1);
      });
    });

    process.on('SIGTERM', () => {
      this.logger.info('Received SIGTERM, shutting down gracefully');
      this.stop().then(() => {
        process.exit(0);
      }).catch((error) => {
        this.logger.error('Error during shutdown', { error });
        process.exit(1);
      });
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Server is already running');
      return;
    }

    try {
      this.logger.info('Starting AI Screenshot Server', {
        websocketPort: this.config.websocket.port,
        websocketHost: this.config.websocket.host,
      });

      this.startTime = Date.now();

      // Start WebSocket server first
      await this.webSocketServer.start();

      // Start MCP server
      await this.mcpServer.start();

      this.isRunning = true;

      this.logger.info('AI Screenshot Server started successfully', {
        websocketPort: this.config.websocket.port,
        mcpToolsCount: this.mcpServer.getRegisteredTools().length,
        uptime: Date.now() - this.startTime,
      });

      this.emit('started');

      // Display connection information
      this.displayConnectionInfo();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start AI Screenshot Server', { error: errorMessage });
      
      // Cleanup on failure
      await this.cleanup();
      
      throw new Error(`Server startup failed: ${errorMessage}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Server is not running');
      return;
    }

    try {
      this.logger.info('Stopping AI Screenshot Server');

      // Stop services in reverse order
      await this.mcpServer.stop();
      await this.webSocketServer.stop();

      this.isRunning = false;

      this.logger.info('AI Screenshot Server stopped successfully', {
        uptime: Date.now() - this.startTime,
      });

      this.emit('stopped');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error stopping AI Screenshot Server', { error: errorMessage });
      throw new Error(`Server shutdown failed: ${errorMessage}`);
    }
  }

  private async cleanup(): Promise<void> {
    this.logger.info('Cleaning up AI Screenshot Server');

    try {
      // Cleanup all services
      this.mcpServer.cleanup();
      this.messageHandler.cleanup();
      this.screenshotService.cleanup();
      this.contextService.cleanup();

      if (this.webSocketServer.isActive) {
        await this.webSocketServer.stop();
      }

      this.logger.info('AI Screenshot Server cleanup completed');
    } catch (error) {
      this.logger.error('Error during cleanup', { error });
    }
  }

  private displayConnectionInfo(): void {
    const wsPort = this.config.websocket.port;
    const wsHost = this.config.websocket.host;
    const tools = this.mcpServer.getRegisteredTools();

    console.log('\n' + '='.repeat(60));
    console.log('🚀 AI Screenshot Server Started Successfully!');
    console.log('='.repeat(60));
    console.log(`📡 WebSocket Server: ws://${wsHost}:${wsPort}`);
    console.log(`🔧 MCP Tools Available: ${tools.length}`);
    console.log(`   ${tools.map(tool => `• ${tool}`).join('\n   ')}`);
    console.log('\n📱 React Native Integration:');
    console.log('   Add this to your React Native app:');
    console.log('   ');
    console.log('   <AIScreenshotProvider config={{');
    console.log(`     serverUrl: 'ws://${wsHost}:${wsPort}',`);
    console.log('     autoDiscovery: true');
    console.log('   }}>');
    console.log('     <App />');
    console.log('   </AIScreenshotProvider>');
    console.log('\n🤖 AI Assistant Configuration:');
    console.log('   Add this MCP server to your AI assistant:');
    console.log('   Command: node path/to/server/dist/cli.js');
    console.log('='.repeat(60) + '\n');
  }

  // Public API methods
  async requestScreenshot(clientId?: string, options?: any): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    return this.screenshotService.requestScreenshot(clientId, options);
  }

  async requestContext(clientId?: string, options?: any): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    return this.contextService.requestContext(clientId, options);
  }

  async sendCommand(command: string, params?: any, clientId?: string): Promise<any> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    return this.messageHandler.sendCommand(command, params, clientId);
  }

  // Status and monitoring
  getServerStatus(): {
    isRunning: boolean;
    uptime: number;
    websocket: any;
    mcp: any;
    clients: any[];
    cache: any;
  } {
    const uptime = this.isRunning ? Date.now() - this.startTime : 0;
    
    return {
      isRunning: this.isRunning,
      uptime,
      websocket: this.webSocketServer.getServerStats(),
      mcp: this.mcpServer.getServerStats(),
      clients: this.webSocketServer.getClients(),
      cache: {
        screenshots: this.screenshotService.getCacheStats(),
        contexts: this.contextService.getCacheStats(),
      },
    };
  }

  getConnectedClients(): any[] {
    return this.webSocketServer.getClients();
  }

  // Configuration
  getConfig(): ServerConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ServerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Server configuration updated', { newConfig });
  }

  // Service access (for advanced usage)
  get services() {
    return {
      webSocket: this.webSocketServer,
      messageHandler: this.messageHandler,
      screenshot: this.screenshotService,
      context: this.contextService,
      mcp: this.mcpServer,
    };
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    checks: Record<string, boolean>;
    timestamp: number;
  }> {
    const checks = {
      websocketServer: this.webSocketServer.isActive,
      mcpServer: this.mcpServer.isActive,
      hasConnectedClients: this.webSocketServer.clientCount > 0,
    };

    const allHealthy = Object.values(checks).every(check => check);

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: Date.now(),
    };
  }
}