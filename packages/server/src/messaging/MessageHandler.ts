import { EventEmitter } from 'events';
import { WSMessage, MessageType, ServerConfig } from '../types';
import { Logger } from '../utils/Logger';
import { WebSocketServer } from '../websocket/WebSocketServer';

interface MessageProcessor {
  type: MessageType;
  handler: (clientId: string, message: WSMessage) => Promise<WSMessage | null>;
}

export class MessageHandler extends EventEmitter {
  private config: ServerConfig;
  private logger: Logger;
  private processors: Map<MessageType, MessageProcessor> = new Map();
  private webSocketServer: WebSocketServer;
  private pendingRequests: Map<string, {
    clientId: string;
    timestamp: number;
    timeout: NodeJS.Timeout;
    resolve: (response: WSMessage) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: ServerConfig, webSocketServer: WebSocketServer) {
    super();
    this.config = config;
    this.logger = new Logger('info', '[MessageHandler]');
    this.webSocketServer = webSocketServer;
    
    this.setupDefaultProcessors();
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.webSocketServer.on('message', (clientId: string, message: WSMessage) => {
      this.handleMessage(clientId, message);
    });

    this.webSocketServer.on('clientDisconnected', (clientId: string) => {
      this.handleClientDisconnected(clientId);
    });
  }

  private setupDefaultProcessors(): void {
    // Screenshot request processor
    this.registerProcessor(MessageType.SCREENSHOT_REQUEST, async (clientId, message) => {
      this.logger.info('Processing screenshot request', { clientId, messageId: message.id });
      
      try {
        // Forward the request to the client and wait for response
        const response = await this.sendRequestAndWaitForResponse(
          clientId,
          message,
          MessageType.SCREENSHOT_RESPONSE,
          this.config.mcp.timeout
        );
        
        this.logger.info('Screenshot request completed', { 
          clientId, 
          messageId: message.id,
          responseSize: response.data?.length || 0
        });
        
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Screenshot request failed', { 
          clientId, 
          messageId: message.id, 
          error: errorMessage 
        });
        
        return {
          type: MessageType.ERROR,
          id: `error-${Date.now()}`,
          timestamp: Date.now(),
          error: {
            code: 'SCREENSHOT_FAILED',
            message: errorMessage,
          },
        };
      }
    });

    // Context request processor
    this.registerProcessor(MessageType.CONTEXT_REQUEST, async (clientId, message) => {
      this.logger.info('Processing context request', { clientId, messageId: message.id });
      
      try {
        const response = await this.sendRequestAndWaitForResponse(
          clientId,
          message,
          MessageType.CONTEXT_RESPONSE,
          this.config.mcp.timeout
        );
        
        this.logger.info('Context request completed', { 
          clientId, 
          messageId: message.id 
        });
        
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Context request failed', { 
          clientId, 
          messageId: message.id, 
          error: errorMessage 
        });
        
        return {
          type: MessageType.ERROR,
          id: `error-${Date.now()}`,
          timestamp: Date.now(),
          error: {
            code: 'CONTEXT_FAILED',
            message: errorMessage,
          },
        };
      }
    });

    // Command processor
    this.registerProcessor(MessageType.COMMAND, async (clientId, message) => {
      this.logger.info('Processing command', { 
        clientId, 
        messageId: message.id, 
        command: message.data?.command 
      });
      
      try {
        // Forward command to client
        const sent = this.webSocketServer.sendToClient(clientId, message);
        
        if (!sent) {
          throw new Error('Failed to send command to client');
        }
        
        this.logger.info('Command sent to client', { 
          clientId, 
          messageId: message.id 
        });
        
        return {
          type: 'command_ack' as any,
          id: `command_ack-${Date.now()}`,
          timestamp: Date.now(),
          data: {
            originalMessageId: message.id,
            status: 'sent',
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Command processing failed', { 
          clientId, 
          messageId: message.id, 
          error: errorMessage 
        });
        
        return {
          type: MessageType.ERROR,
          id: `error-${Date.now()}`,
          timestamp: Date.now(),
          error: {
            code: 'COMMAND_FAILED',
            message: errorMessage,
          },
        };
      }
    });

    // Response processors (for handling responses to our requests)
    this.registerProcessor(MessageType.SCREENSHOT_RESPONSE, async (clientId, message) => {
      this.handleResponse(message);
      return null; // No response needed
    });

    this.registerProcessor(MessageType.CONTEXT_RESPONSE, async (clientId, message) => {
      this.handleResponse(message);
      return null; // No response needed
    });

    // Error processor
    this.registerProcessor(MessageType.ERROR, async (clientId, message) => {
      this.logger.warn('Received error from client', { 
        clientId, 
        messageId: message.id, 
        error: message.error 
      });
      
      this.handleResponse(message);
      return null; // No response needed
    });
  }

  registerProcessor(type: MessageType, handler: (clientId: string, message: WSMessage) => Promise<WSMessage | null>): void {
    this.processors.set(type, { type, handler });
    this.logger.debug('Message processor registered', { type });
  }

  private async handleMessage(clientId: string, message: WSMessage): Promise<void> {
    const processor = this.processors.get(message.type);
    
    if (!processor) {
      this.logger.warn('No processor found for message type', { 
        clientId, 
        messageType: message.type, 
        messageId: message.id 
      });
      
      // Send error response
      this.webSocketServer.sendToClient(clientId, {
        type: MessageType.ERROR,
        id: `error-${Date.now()}`,
        timestamp: Date.now(),
        error: {
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `No processor found for message type: ${message.type}`,
        },
      });
      return;
    }

    try {
      const response = await processor.handler(clientId, message);
      
      if (response) {
        const sent = this.webSocketServer.sendToClient(clientId, response);
        if (!sent) {
          this.logger.error('Failed to send response to client', { 
            clientId, 
            messageId: message.id 
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Message processing failed', { 
        clientId, 
        messageType: message.type, 
        messageId: message.id, 
        error: errorMessage 
      });
      
      // Send error response
      this.webSocketServer.sendToClient(clientId, {
        type: MessageType.ERROR,
        id: `error-${Date.now()}`,
        timestamp: Date.now(),
        error: {
          code: 'PROCESSING_FAILED',
          message: errorMessage,
        },
      });
    }
  }

  private async sendRequestAndWaitForResponse(
    clientId: string,
    request: WSMessage,
    expectedResponseType: MessageType,
    timeout: number
  ): Promise<WSMessage> {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        clientId,
        timestamp: Date.now(),
        timeout: timeoutHandle,
        resolve,
        reject,
      });

      // Send the request
      const sent = this.webSocketServer.sendToClient(clientId, request);
      if (!sent) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(requestId);
        reject(new Error('Failed to send request to client'));
      }
    });
  }

  private handleResponse(response: WSMessage): void {
    // For responses, we need to match them with pending requests
    // This is a simplified implementation - in practice, you might need more sophisticated matching
    const originalRequestId = this.findOriginalRequestId(response);
    
    if (!originalRequestId) {
      this.logger.debug('Received response without matching request', { 
        responseId: response.id, 
        responseType: response.type 
      });
      return;
    }

    const pendingRequest = this.pendingRequests.get(originalRequestId);
    if (!pendingRequest) {
      this.logger.debug('Received response for unknown request', { 
        originalRequestId, 
        responseId: response.id 
      });
      return;
    }

    // Clear timeout and resolve
    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(originalRequestId);
    pendingRequest.resolve(response);
  }

  private findOriginalRequestId(response: WSMessage): string | null {
    // Try to find the original request ID from the response
    // This could be in response.id (if it matches), or in response.data
    
    if (response.data?.originalRequestId) {
      return response.data.originalRequestId;
    }
    
    // For screenshot and context responses, the ID might match the request ID
    if (response.type === MessageType.SCREENSHOT_RESPONSE || 
        response.type === MessageType.CONTEXT_RESPONSE) {
      return response.id;
    }
    
    // For errors, check if there's a reference to the original request
    if (response.type === MessageType.ERROR && response.error?.details?.originalRequestId) {
      return response.error.details.originalRequestId;
    }
    
    return null;
  }

  private handleClientDisconnected(clientId: string): void {
    // Clean up any pending requests for this client
    const toRemove: string[] = [];
    
    for (const [requestId, pendingRequest] of this.pendingRequests) {
      if (pendingRequest.clientId === clientId) {
        clearTimeout(pendingRequest.timeout);
        pendingRequest.reject(new Error('Client disconnected'));
        toRemove.push(requestId);
      }
    }
    
    toRemove.forEach(requestId => this.pendingRequests.delete(requestId));
    
    if (toRemove.length > 0) {
      this.logger.info('Cleaned up pending requests for disconnected client', { 
        clientId, 
        cleanedRequests: toRemove.length 
      });
    }
  }

  // Public methods for external use (e.g., MCP server)
  async requestScreenshot(clientId?: string): Promise<WSMessage> {
    const targetClientId = clientId || this.getFirstAvailableClient();
    
    if (!targetClientId) {
      throw new Error('No clients available for screenshot request');
    }

    const request: WSMessage = {
      type: MessageType.SCREENSHOT_REQUEST,
      id: `screenshot-${Date.now()}`,
      timestamp: Date.now(),
    };

    return this.sendRequestAndWaitForResponse(
      targetClientId,
      request,
      MessageType.SCREENSHOT_RESPONSE,
      this.config.mcp.timeout
    );
  }

  async requestContext(clientId?: string): Promise<WSMessage> {
    const targetClientId = clientId || this.getFirstAvailableClient();
    
    if (!targetClientId) {
      throw new Error('No clients available for context request');
    }

    const request: WSMessage = {
      type: MessageType.CONTEXT_REQUEST,
      id: `context-${Date.now()}`,
      timestamp: Date.now(),
    };

    return this.sendRequestAndWaitForResponse(
      targetClientId,
      request,
      MessageType.CONTEXT_RESPONSE,
      this.config.mcp.timeout
    );
  }

  async sendCommand(command: string, params?: any, clientId?: string): Promise<WSMessage> {
    const targetClientId = clientId || this.getFirstAvailableClient();
    
    if (!targetClientId) {
      throw new Error('No clients available for command');
    }

    const request: WSMessage = {
      type: MessageType.COMMAND,
      id: `command-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        command,
        params,
      },
    };

    // For commands, we don't wait for a specific response type
    const sent = this.webSocketServer.sendToClient(targetClientId, request);
    if (!sent) {
      throw new Error('Failed to send command to client');
    }

    return {
      type: 'command_sent' as any,
      id: `command_sent-${Date.now()}`,
      timestamp: Date.now(),
      data: {
        originalRequestId: request.id,
        clientId: targetClientId,
        command,
        params,
      },
    };
  }

  private getFirstAvailableClient(): string | null {
    const clients = this.webSocketServer.getClients();
    return clients.length > 0 ? clients[0].id : null;
  }

  // Statistics and monitoring
  getStats(): {
    processorsCount: number;
    pendingRequestsCount: number;
    availableClients: number;
  } {
    return {
      processorsCount: this.processors.size,
      pendingRequestsCount: this.pendingRequests.size,
      availableClients: this.webSocketServer.clientCount,
    };
  }

  cleanup(): void {
    // Clear all pending requests
    for (const [requestId, pendingRequest] of this.pendingRequests) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.reject(new Error('Message handler cleanup'));
    }
    this.pendingRequests.clear();
    
    this.logger.info('Message handler cleaned up');
  }
}