import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ServerConfig, MCPTool } from '../types';
import { Logger } from '../utils/Logger';
import { MessageHandler } from '../messaging/MessageHandler';
import { ScreenshotService } from '../services/ScreenshotService';
import { ContextService } from '../services/ContextService';

export class MCPServer {
  private server: Server;
  private config: ServerConfig;
  private logger: Logger;
  private messageHandler: MessageHandler;
  private screenshotService: ScreenshotService;
  private contextService: ContextService;
  private tools: Map<string, MCPTool> = new Map();
  private isRunning = false;

  constructor(
    config: ServerConfig,
    messageHandler: MessageHandler,
    screenshotService: ScreenshotService,
    contextService: ContextService
  ) {
    this.config = config;
    this.logger = new Logger('info', '[MCPServer]');
    this.messageHandler = messageHandler;
    this.screenshotService = screenshotService;
    this.contextService = contextService;

    // Initialize MCP server
    this.server = new Server({
      name: 'react-native-live-context-server',
      version: '1.0.0',
    });

    this.setupServerHandlers();
    this.registerDefaultTools();
  }

  private setupServerHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      this.logger.debug('Tools listed', { count: tools.length });
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      this.logger.info('Tool called', { name, args });

      const tool = this.tools.get(name);
      if (!tool) {
        const error = `Unknown tool: ${name}`;
        this.logger.error(error);
        throw new Error(error);
      }

      try {
        const result = await tool.handler(args || {});

        this.logger.info('Tool executed successfully', {
          name,
          resultType: typeof result,
          resultSize: JSON.stringify(result).length,
        });

        return {
          content: [
            {
              type: 'text',
              text:
                typeof result === 'string'
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Tool execution failed', {
          name,
          error: errorMessage,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Handle server errors
    this.server.onerror = error => {
      this.logger.error('MCP server error', { error: error.message });
    };
  }

  private registerDefaultTools(): void {
    // Register built-in tools
    this.registerTool({
      name: 'get_current_screenshot',
      description:
        'Capture a screenshot of the current React Native application screen',
      inputSchema: {
        type: 'object',
        properties: {
          client_id: {
            type: 'string',
            description:
              'Optional client ID to capture screenshot from specific device',
          },
          quality: {
            type: 'number',
            minimum: 0.1,
            maximum: 1.0,
            description: 'Screenshot quality (0.1 to 1.0, default: 0.8)',
          },
          format: {
            type: 'string',
            enum: ['png', 'jpg'],
            description: 'Screenshot format (default: png)',
          },
          width: {
            type: 'number',
            description: 'Optional width for screenshot resizing',
          },
          height: {
            type: 'number',
            description: 'Optional height for screenshot resizing',
          },
        },
      },
      handler: async input => {
        const screenshot = await this.screenshotService.requestScreenshot(
          input.client_id,
          {
            quality: input.quality,
            format: input.format,
            width: input.width,
            height: input.height,
          }
        );

        return {
          success: true,
          screenshot: {
            id: screenshot.id,
            data: screenshot.data,
            timestamp: screenshot.timestamp,
            metadata: screenshot.metadata,
            client_id: screenshot.clientId,
          },
        };
      },
    });

    this.registerTool({
      name: 'get_app_context',
      description:
        'Get the current context and state of the React Native application',
      inputSchema: {
        type: 'object',
        properties: {
          client_id: {
            type: 'string',
            description:
              'Optional client ID to get context from specific device',
          },
          include_component_tree: {
            type: 'boolean',
            description:
              'Include component tree in the response (default: true)',
          },
          include_interactions: {
            type: 'boolean',
            description:
              'Include user interactions in the response (default: true)',
          },
          max_interactions: {
            type: 'number',
            description:
              'Maximum number of recent interactions to include (default: 10)',
          },
        },
      },
      handler: async input => {
        const context = await this.contextService.requestContext(
          input.client_id,
          {
            includeComponentTree: input.include_component_tree,
            includeInteractions: input.include_interactions,
            maxInteractions: input.max_interactions,
          }
        );

        return {
          success: true,
          context: {
            current_route: context.currentRoute,
            route_params: context.routeParams,
            component_tree: context.componentTree,
            user_interactions: context.userInteractions,
            timestamp: context.timestamp,
          },
        };
      },
    });

    this.registerTool({
      name: 'send_command',
      description: 'Send a command to the React Native application',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to send to the application',
          },
          params: {
            type: 'object',
            description: 'Optional parameters for the command',
          },
          client_id: {
            type: 'string',
            description:
              'Optional client ID to send command to specific device',
          },
        },
        required: ['command'],
      },
      handler: async input => {
        const result = await this.messageHandler.sendCommand(
          input.command,
          input.params,
          input.client_id
        );

        return {
          success: true,
          command_result: {
            command: input.command,
            params: input.params,
            client_id: input.client_id,
            sent_at: result.timestamp,
            message_id: result.id,
          },
        };
      },
    });

    this.registerTool({
      name: 'list_connected_devices',
      description: 'List all currently connected React Native devices/clients',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const clients = this.messageHandler['webSocketServer'].getClients();

        return {
          success: true,
          devices: clients.map(client => ({
            id: client.id,
            platform: client.metadata.platform,
            version: client.metadata.version,
            user_agent: client.metadata.userAgent,
            last_heartbeat: client.lastHeartbeat,
            connected_at: client.lastHeartbeat, // Simplified
          })),
          total_count: clients.length,
        };
      },
    });

    this.registerTool({
      name: 'get_server_status',
      description:
        'Get the current status and statistics of the screenshot server',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const wsStats = this.messageHandler['webSocketServer'].getServerStats();
        const messageStats = this.messageHandler.getStats();
        const screenshotStats = this.screenshotService.getCacheStats();
        const contextStats = this.contextService.getCacheStats();

        return {
          success: true,
          server_status: {
            websocket: {
              running: wsStats.isRunning,
              client_count: wsStats.clientCount,
              port: wsStats.port,
              host: wsStats.host,
            },
            message_handler: {
              processors_count: messageStats.processorsCount,
              pending_requests: messageStats.pendingRequestsCount,
              available_clients: messageStats.availableClients,
            },
            screenshot_cache: {
              size: screenshotStats.size,
              max_size: screenshotStats.maxSize,
              max_age_ms: screenshotStats.maxAge,
            },
            context_cache: {
              size: contextStats.size,
              clients: contextStats.clients,
            },
          },
        };
      },
    });

    this.logger.info('Default MCP tools registered', {
      count: this.tools.size,
    });
  }

  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    this.logger.debug('MCP tool registered', { name: tool.name });
  }

  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      this.logger.debug('MCP tool unregistered', { name });
    }
    return removed;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('MCP server is already running');
      return;
    }

    try {
      this.logger.info('Starting MCP server');

      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.isRunning = true;
      this.logger.info('MCP server started successfully', {
        toolsCount: this.tools.size,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start MCP server', { error: errorMessage });
      throw new Error(`MCP server startup failed: ${errorMessage}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('MCP server is not running');
      return;
    }

    try {
      this.logger.info('Stopping MCP server');

      await this.server.close();

      this.isRunning = false;
      this.logger.info('MCP server stopped successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error stopping MCP server', { error: errorMessage });
      throw new Error(`MCP server shutdown failed: ${errorMessage}`);
    }
  }

  // Public getters and utility methods
  get isActive(): boolean {
    return this.isRunning;
  }

  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  getToolInfo(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getServerStats(): {
    isRunning: boolean;
    toolsCount: number;
    registeredTools: string[];
  } {
    return {
      isRunning: this.isRunning,
      toolsCount: this.tools.size,
      registeredTools: this.getRegisteredTools(),
    };
  }

  cleanup(): void {
    if (this.isRunning) {
      this.stop().catch(error => {
        this.logger.error('Error during MCP server cleanup', { error });
      });
    }

    this.tools.clear();
    this.logger.info('MCP server cleaned up');
  }
}
