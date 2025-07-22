// Type definitions for the client SDK

export interface SDKConfig {
  // Server connection configuration
  serverUrl?: string;           // Complete URL: 'ws://192.168.1.100:8080'
  serverHost?: string;          // Host address: '192.168.1.100'
  serverPort?: number;          // Port: 8080
  
  // Auto-discovery configuration
  autoDiscovery?: boolean;      // Enable auto-discovery (default: true)
  discoveryTimeout?: number;    // Discovery timeout in ms (default: 5000)
  fallbackUrl?: string;         // Fallback URL if discovery fails
  retryAttempts?: number;       // Connection retry attempts (default: 3)
  
  // Feature configuration
  enableInProduction?: boolean; // Enable in production (default: false)
  privacyMode?: boolean;        // Privacy mode (default: false)
  screenshotQuality?: number;   // Screenshot quality 0-1 (default: 0.8)
  
  // Debug configuration
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // Log level (default: 'warn')
  showConnectionStatus?: boolean; // Show connection status (default: true in dev)
}

export interface ScreenshotOptions {
  quality?: number;
  format?: 'png' | 'jpg';
  width?: number;
  height?: number;
}

export interface ServerInfo {
  host: string;
  port: number;
  version: string;
  capabilities: string[];
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

export interface AppContext {
  currentRoute: string;
  routeParams: Record<string, any>;
  componentTree: ComponentNode[];
  userInteractions: InteractionEvent[];
  timestamp: number;
}

export interface ComponentNode {
  type: string;
  props: Record<string, any>;
  children: ComponentNode[];
  position?: { x: number; y: number; width: number; height: number };
}

export interface InteractionEvent {
  type: 'press' | 'scroll' | 'input';
  target: string;
  timestamp: number;
  data?: any;
}