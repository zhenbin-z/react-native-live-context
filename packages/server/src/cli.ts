#!/usr/bin/env node

import { Command } from 'commander';
import { LiveContextServer } from './server/LiveContextServer';
import { ServerConfig } from './types';
import { Logger } from './utils/Logger';
import * as qrcode from 'qrcode-terminal';

const program = new Command();
const logger = new Logger('info', '[CLI]');

// Default configuration
const defaultConfig: ServerConfig = {
  websocket: {
    port: 8080,
    host: 'localhost',
    maxConnections: 100,
    heartbeatInterval: 30000,
  },
  mcp: {
    port: 8081,
    tools: ['screenshot', 'context', 'command'],
    timeout: 10000,
  },
  cache: {
    maxScreenshots: 50,
    maxAge: 300000, // 5 minutes
  },
  security: {
    allowedOrigins: ['*'],
    enableCORS: true,
  },
};

program
  .name('react-native-live-context-server')
  .description('React Native Live Context Server - WebSocket + MCP server for AI assistants')
  .version('1.0.0');

program
  .command('start')
  .description('Start the Live Context Server')
  .option('-p, --port <port>', 'WebSocket server port', '8080')
  .option('-h, --host <host>', 'WebSocket server host', 'localhost')
  .option('--max-connections <max>', 'Maximum WebSocket connections', '100')
  .option('--cache-size <size>', 'Maximum screenshots to cache', '50')
  .option('--cache-ttl <ttl>', 'Cache TTL in seconds', '300')
  .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .option('--qr', 'Show QR code for mobile connection')
  .option('--no-banner', 'Disable startup banner')
  .action(async (options) => {
    try {
      // Build configuration
      const config: ServerConfig = {
        ...defaultConfig,
        websocket: {
          ...defaultConfig.websocket,
          port: parseInt(options.port),
          host: options.host,
          maxConnections: parseInt(options.maxConnections),
        },
        cache: {
          ...defaultConfig.cache,
          maxScreenshots: parseInt(options.cacheSize),
          maxAge: parseInt(options.cacheTtl) * 1000,
        },
      };

      // Set log level
      logger.setLevel(options.logLevel);

      if (!options.noBanner) {
        displayBanner();
      }

      logger.info('Starting Live Context Server', { config });

      // Create and start server
      const server = new LiveContextServer(config);

      // Setup event handlers
      server.on('started', () => {
        logger.info('Server started successfully');
        
        if (options.qr) {
          displayQRCode(config.websocket.host, config.websocket.port);
        }
      });

      server.on('client:connected', (clientId, metadata) => {
        logger.info(`📱 Device connected: ${metadata.platform} (${clientId})`);
      });

      server.on('client:disconnected', (clientId) => {
        logger.info(`📱 Device disconnected: ${clientId}`);
      });

      server.on('error', (error) => {
        logger.error('Server error', { error: error.message });
      });

      // Start the server
      await server.start();

      // Keep the process running
      process.on('SIGINT', async () => {
        logger.info('Shutting down server...');
        await server.stop();
        process.exit(0);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start server', { error: errorMessage });
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check server status')
  .option('-p, --port <port>', 'WebSocket server port to check', '8080')
  .option('-h, --host <host>', 'WebSocket server host to check', 'localhost')
  .action(async (options) => {
    try {
      // Simple health check by trying to connect
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://${options.host}:${options.port}`);

      ws.on('open', () => {
        console.log('✅ Server is running and accepting connections');
        ws.close();
        process.exit(0);
      });

      ws.on('error', () => {
        console.log('❌ Server is not running or not accessible');
        process.exit(1);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        console.log('❌ Connection timeout - server may not be running');
        ws.close();
        process.exit(1);
      }, 5000);

    } catch (error) {
      console.log('❌ Error checking server status:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Generate configuration examples')
  .option('--react-native', 'Show React Native integration code')
  .option('--mcp', 'Show MCP server configuration')
  .action((options) => {
    if (options.reactNative) {
      displayReactNativeConfig();
    } else if (options.mcp) {
      displayMCPConfig();
    } else {
      displayAllConfigs();
    }
  });

function displayBanner(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🚀 React Native Live Context Server                      ║
║                                                              ║
║    Bridge between React Native apps and AI assistants       ║
║    via WebSocket + MCP (Model Context Protocol)             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

function displayQRCode(host: string, port: number): void {
  const url = `ws://${host}:${port}`;
  console.log('\n📱 Scan this QR code to connect your React Native app:\n');
  qrcode.generate(url, { small: true });
  console.log(`\nURL: ${url}\n`);
}

function displayReactNativeConfig(): void {
  console.log(`
📱 React Native Integration:

1. Install the client SDK:
   npm install @rn-ai-screenshot/client

2. Add to your App.js/App.tsx:

   import { LiveContextProvider } from '@react-native-live-context/client';

   export default function App() {
     return (
       <LiveContextProvider config={{
         autoDiscovery: true,
         // Or specify server directly:
         // serverUrl: 'ws://localhost:8080',
       }}>
         <YourAppContent />
       </LiveContextProvider>
     );
   }

3. Optional: Add connection status indicator:

   import { ConnectionStatus } from '@rn-ai-screenshot/client';

   <ConnectionStatus position="top" />
`);
}

function displayMCPConfig(): void {
  console.log(`
🤖 MCP Server Configuration:

Add this to your AI assistant's MCP configuration:

{
  "mcpServers": {
    "react-native-screenshot": {
      "command": "node",
      "args": ["path/to/server/dist/cli.js", "start"],
      "env": {}
    }
  }
}

Available MCP Tools:
• get_current_screenshot - Capture app screenshot
• get_app_context - Get app state and navigation info
• send_command - Send commands to the app
• list_connected_devices - List connected devices
• get_server_status - Get server statistics
`);
}

function displayAllConfigs(): void {
  displayReactNativeConfig();
  displayMCPConfig();
}

// Handle MCP mode (when called by AI assistant)
if (process.argv.includes('--mcp') || process.env.MCP_MODE === 'true') {
  // Run in MCP mode - start server and connect to stdio
  const server = new LiveContextServer(defaultConfig);
  
  server.start().catch((error) => {
    logger.error('Failed to start MCP server', { error });
    process.exit(1);
  });
} else {
  // Run CLI
  program.parse();
}