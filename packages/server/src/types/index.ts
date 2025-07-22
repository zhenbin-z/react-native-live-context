// Type definitions for the server

export interface ServerConfig {
  websocket: {
    port: number;
    host: string;
    maxConnections: number;
    heartbeatInterval: number;
  };
  mcp: {
    port: number;
    tools: string[];
    timeout: number;
  };
  cache: {
    maxScreenshots: number;
    maxAge: number; // milliseconds
  };
  security: {
    allowedOrigins: string[];
    enableCORS: boolean;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema
  handler: (input: any) => Promise<any>;
}

export interface WSMessage {
  type: MessageType;
  id: string;
  timestamp: number;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export enum MessageType {
  SCREENSHOT_REQUEST = 'screenshot_request',
  SCREENSHOT_RESPONSE = 'screenshot_response',
  CONTEXT_REQUEST = 'context_request',
  CONTEXT_RESPONSE = 'context_response',
  COMMAND = 'command',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error'
}

export interface ClientConnection {
  id: string;
  socket: any; // WebSocket
  lastHeartbeat: number;
  metadata: {
    userAgent?: string;
    platform?: string;
    version?: string;
  };
}

export interface ScreenshotData {
  id: string;
  clientId: string;
  data: string; // base64
  timestamp: number;
  metadata: {
    width: number;
    height: number;
    format: string;
    quality: number;
  };
}

export interface AppContext {
  currentRoute: string;
  routeParams: Record<string, any>;
  componentTree: any[];
  userInteractions: any[];
  timestamp: number;
}