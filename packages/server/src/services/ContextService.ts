import { AppContext, ServerConfig } from '../types';
import { Logger } from '../utils/Logger';
import { MessageHandler } from '../messaging/MessageHandler';

interface CachedContext {
  clientId: string;
  context: AppContext;
  timestamp: number;
}

export class ContextService {
  private config: ServerConfig;
  private logger: Logger;
  private messageHandler: MessageHandler;
  private cache: Map<string, CachedContext> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ServerConfig, messageHandler: MessageHandler) {
    this.config = config;
    this.logger = new Logger('info', '[ContextService]');
    this.messageHandler = messageHandler;
    
    this.startCleanupTimer();
  }

  async requestContext(clientId?: string, options?: {
    includeComponentTree?: boolean;
    includeInteractions?: boolean;
    maxInteractions?: number;
  }): Promise<AppContext> {
    this.logger.info('Requesting app context', { clientId, options });

    try {
      // Check cache first
      const cacheKey = clientId || 'default';
      const cached = this.cache.get(cacheKey);
      
      if (cached && this.isCacheValid(cached)) {
        this.logger.debug('Returning cached context', { 
          clientId, 
          age: Date.now() - cached.timestamp 
        });
        return cached.context;
      }

      // Request new context from client
      const response = await this.messageHandler.requestContext(clientId);
      
      if (response.error) {
        throw new Error(`Context request failed: ${response.error.message}`);
      }

      if (!response.data) {
        throw new Error('Context response contains no data');
      }

      // Process and validate context data
      const context = this.processContextData(response.data, options);

      // Cache the context
      this.updateContext(cacheKey, context);

      this.logger.info('App context retrieved successfully', {
        clientId,
        route: context.currentRoute,
        componentsCount: context.componentTree?.length || 0,
        interactionsCount: context.userInteractions?.length || 0,
      });

      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Context request failed', { clientId, error: errorMessage });
      throw new Error(`Failed to retrieve app context: ${errorMessage}`);
    }
  }

  updateContext(clientId: string, context: AppContext): void {
    const cachedContext: CachedContext = {
      clientId,
      context,
      timestamp: Date.now(),
    };

    this.cache.set(clientId, cachedContext);
    
    this.logger.debug('Context cached', {
      clientId,
      route: context.currentRoute,
      timestamp: cachedContext.timestamp,
    });
  }

  getLatestContext(clientId?: string): AppContext | null {
    const cacheKey = clientId || 'default';
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      return cached.context;
    }
    
    return null;
  }

  getAllContexts(): AppContext[] {
    const contexts: AppContext[] = [];

    for (const cached of this.cache.values()) {
      if (this.isCacheValid(cached)) {
        contexts.push(cached.context);
      }
    }

    // Sort by timestamp (newest first)
    return contexts.sort((a, b) => b.timestamp - a.timestamp);
  }

  getContextHistory(clientId: string, limit: number = 10): AppContext[] {
    // In a more sophisticated implementation, we would store context history
    // For now, we just return the latest context if available
    const latest = this.getLatestContext(clientId);
    return latest ? [latest] : [];
  }

  clearCache(clientId?: string): number {
    let clearedCount = 0;

    if (clientId) {
      if (this.cache.delete(clientId)) {
        clearedCount = 1;
      }
    } else {
      clearedCount = this.cache.size;
      this.cache.clear();
    }

    this.logger.info('Context cache cleared', { clientId, clearedCount });
    return clearedCount;
  }

  private processContextData(rawData: any, options?: any): AppContext {
    // Validate and process the context data
    const context: AppContext = {
      currentRoute: rawData.currentRoute || 'unknown',
      routeParams: rawData.routeParams || {},
      componentTree: rawData.componentTree || [],
      userInteractions: rawData.userInteractions || [],
      timestamp: rawData.timestamp || Date.now(),
    };

    // Apply options
    if (options?.includeComponentTree === false) {
      context.componentTree = [];
    }

    if (options?.includeInteractions === false) {
      context.userInteractions = [];
    } else if (options?.maxInteractions && context.userInteractions.length > options.maxInteractions) {
      // Keep only the most recent interactions
      context.userInteractions = context.userInteractions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, options.maxInteractions);
    }

    // Compress component tree if it's too large
    if (context.componentTree.length > 100) {
      context.componentTree = this.compressComponentTree(context.componentTree);
    }

    return context;
  }

  private compressComponentTree(componentTree: any[]): any[] {
    // Simplified compression - remove deep nesting and keep only essential info
    return componentTree.slice(0, 50).map(component => ({
      type: component.type,
      props: this.compressProps(component.props),
      position: component.position,
      // Remove children to reduce size
    }));
  }

  private compressProps(props: any): any {
    if (!props || typeof props !== 'object') {
      return props;
    }

    // Keep only essential props and limit their size
    const compressed: any = {};
    const essentialProps = ['testID', 'accessibilityLabel', 'style', 'title', 'placeholder'];
    
    for (const key of essentialProps) {
      if (props[key] !== undefined) {
        let value = props[key];
        
        // Limit string length
        if (typeof value === 'string' && value.length > 100) {
          value = value.substring(0, 100) + '...';
        }
        
        compressed[key] = value;
      }
    }

    return compressed;
  }

  private isCacheValid(cached: CachedContext): boolean {
    const age = Date.now() - cached.timestamp;
    // Context cache has a shorter TTL than screenshots (30 seconds)
    return age < Math.min(this.config.cache.maxAge, 30000);
  }

  private startCleanupTimer(): void {
    // Clean up expired cache entries every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 30000);

    this.logger.debug('Context cache cleanup timer started');
  }

  private cleanupExpiredCache(): void {
    const toDelete: string[] = [];
    const now = Date.now();
    const maxAge = Math.min(this.config.cache.maxAge, 30000);

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > maxAge) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.cache.delete(key));

    if (toDelete.length > 0) {
      this.logger.debug('Cleaned up expired contexts', { count: toDelete.length });
    }
  }

  // Route change tracking
  trackRouteChange(clientId: string, route: string, params: Record<string, any> = {}): void {
    const cached = this.cache.get(clientId);
    
    if (cached) {
      // Update the existing context
      cached.context.currentRoute = route;
      cached.context.routeParams = params;
      cached.context.timestamp = Date.now();
      cached.timestamp = Date.now();
      
      this.logger.debug('Route change tracked', { clientId, route });
    } else {
      // Create new context entry
      const context: AppContext = {
        currentRoute: route,
        routeParams: params,
        componentTree: [],
        userInteractions: [],
        timestamp: Date.now(),
      };
      
      this.updateContext(clientId, context);
      this.logger.debug('New route tracked', { clientId, route });
    }
  }

  // Interaction tracking
  trackInteraction(clientId: string, interaction: {
    type: 'press' | 'scroll' | 'input';
    target: string;
    data?: any;
  }): void {
    const cached = this.cache.get(clientId);
    
    if (cached) {
      const interactionEvent = {
        ...interaction,
        timestamp: Date.now(),
      };
      
      cached.context.userInteractions.push(interactionEvent);
      
      // Keep only last 50 interactions
      if (cached.context.userInteractions.length > 50) {
        cached.context.userInteractions = cached.context.userInteractions.slice(-50);
      }
      
      cached.timestamp = Date.now();
      
      this.logger.debug('Interaction tracked', { 
        clientId, 
        type: interaction.type, 
        target: interaction.target 
      });
    }
  }

  // Statistics and monitoring
  getCacheStats(): {
    size: number;
    clients: string[];
    oldestTimestamp: number;
    newestTimestamp: number;
  } {
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    const clients: string[] = [];

    for (const [clientId, cached] of this.cache.entries()) {
      clients.push(clientId);
      
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
      }
      if (cached.timestamp > newestTimestamp) {
        newestTimestamp = cached.timestamp;
      }
    }

    return {
      size: this.cache.size,
      clients,
      oldestTimestamp: this.cache.size > 0 ? oldestTimestamp : 0,
      newestTimestamp: this.cache.size > 0 ? newestTimestamp : 0,
    };
  }

  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.cache.clear();
    this.logger.info('Context service cleaned up');
  }
}