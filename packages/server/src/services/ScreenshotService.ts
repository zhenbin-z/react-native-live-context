import { ScreenshotData, ServerConfig } from '../types';
import { Logger } from '../utils/Logger';
import { MessageHandler } from '../messaging/MessageHandler';

export class ScreenshotService {
  private config: ServerConfig;
  private logger: Logger;
  private messageHandler: MessageHandler;
  private cache: Map<string, ScreenshotData> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ServerConfig, messageHandler: MessageHandler) {
    this.config = config;
    this.logger = new Logger('info', '[ScreenshotService]');
    this.messageHandler = messageHandler;
    
    this.startCleanupTimer();
  }

  async requestScreenshot(clientId?: string, options?: {
    quality?: number;
    format?: string;
    width?: number;
    height?: number;
  }): Promise<ScreenshotData> {
    this.logger.info('Requesting screenshot', { clientId, options });

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(clientId, options);
      const cached = this.cache.get(cacheKey);
      
      if (cached && this.isCacheValid(cached)) {
        this.logger.debug('Returning cached screenshot', { 
          clientId, 
          cacheKey,
          age: Date.now() - cached.timestamp 
        });
        return cached;
      }

      // Request new screenshot from client
      const response = await this.messageHandler.requestScreenshot(clientId);
      
      if (response.error) {
        throw new Error(`Screenshot request failed: ${response.error.message}`);
      }

      if (!response.data) {
        throw new Error('Screenshot response contains no data');
      }

      // Create screenshot data object
      const screenshotData: ScreenshotData = {
        id: response.id,
        clientId: clientId || 'unknown',
        data: response.data,
        timestamp: Date.now(),
        metadata: {
          width: options?.width || 0,
          height: options?.height || 0,
          format: options?.format || 'png',
          quality: options?.quality || 0.8,
        },
      };

      // Cache the screenshot
      this.cacheScreenshot(cacheKey, screenshotData);

      this.logger.info('Screenshot captured successfully', {
        clientId,
        screenshotId: screenshotData.id,
        dataSize: screenshotData.data.length,
        format: screenshotData.metadata.format,
      });

      return screenshotData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Screenshot request failed', { clientId, error: errorMessage });
      throw new Error(`Failed to capture screenshot: ${errorMessage}`);
    }
  }

  cacheScreenshot(key: string, screenshot: ScreenshotData): void {
    // Check cache size limit
    if (this.cache.size >= this.config.cache.maxScreenshots) {
      this.evictOldestScreenshot();
    }

    this.cache.set(key, screenshot);
    
    this.logger.debug('Screenshot cached', {
      key,
      screenshotId: screenshot.id,
      cacheSize: this.cache.size,
    });
  }

  getLatestScreenshot(clientId?: string): ScreenshotData | null {
    let latest: ScreenshotData | null = null;
    let latestTimestamp = 0;

    for (const screenshot of this.cache.values()) {
      if (clientId && screenshot.clientId !== clientId) {
        continue;
      }

      if (screenshot.timestamp > latestTimestamp && this.isCacheValid(screenshot)) {
        latest = screenshot;
        latestTimestamp = screenshot.timestamp;
      }
    }

    return latest;
  }

  getScreenshotById(id: string): ScreenshotData | null {
    for (const screenshot of this.cache.values()) {
      if (screenshot.id === id && this.isCacheValid(screenshot)) {
        return screenshot;
      }
    }
    return null;
  }

  getAllScreenshots(clientId?: string): ScreenshotData[] {
    const screenshots: ScreenshotData[] = [];

    for (const screenshot of this.cache.values()) {
      if (clientId && screenshot.clientId !== clientId) {
        continue;
      }

      if (this.isCacheValid(screenshot)) {
        screenshots.push(screenshot);
      }
    }

    // Sort by timestamp (newest first)
    return screenshots.sort((a, b) => b.timestamp - a.timestamp);
  }

  clearCache(clientId?: string): number {
    let clearedCount = 0;

    if (clientId) {
      // Clear cache for specific client
      const toDelete: string[] = [];
      
      for (const [key, screenshot] of this.cache.entries()) {
        if (screenshot.clientId === clientId) {
          toDelete.push(key);
        }
      }

      toDelete.forEach(key => {
        this.cache.delete(key);
        clearedCount++;
      });
    } else {
      // Clear all cache
      clearedCount = this.cache.size;
      this.cache.clear();
    }

    this.logger.info('Screenshot cache cleared', { clientId, clearedCount });
    return clearedCount;
  }

  private getCacheKey(clientId?: string, options?: any): string {
    const key = {
      clientId: clientId || 'default',
      quality: options?.quality || 0.8,
      format: options?.format || 'png',
      width: options?.width || 0,
      height: options?.height || 0,
    };
    
    return JSON.stringify(key);
  }

  private isCacheValid(screenshot: ScreenshotData): boolean {
    const age = Date.now() - screenshot.timestamp;
    return age < this.config.cache.maxAge;
  }

  private evictOldestScreenshot(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, screenshot] of this.cache.entries()) {
      if (screenshot.timestamp < oldestTimestamp) {
        oldestKey = key;
        oldestTimestamp = screenshot.timestamp;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug('Evicted oldest screenshot from cache', { key: oldestKey });
    }
  }

  private startCleanupTimer(): void {
    // Clean up expired cache entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000);

    this.logger.debug('Cache cleanup timer started');
  }

  private cleanupExpiredCache(): void {
    const toDelete: string[] = [];
    const now = Date.now();

    for (const [key, screenshot] of this.cache.entries()) {
      if (now - screenshot.timestamp > this.config.cache.maxAge) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.cache.delete(key));

    if (toDelete.length > 0) {
      this.logger.debug('Cleaned up expired screenshots', { count: toDelete.length });
    }
  }

  // Statistics and monitoring
  getCacheStats(): {
    size: number;
    maxSize: number;
    maxAge: number;
    oldestTimestamp: number;
    newestTimestamp: number;
  } {
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;

    for (const screenshot of this.cache.values()) {
      if (screenshot.timestamp < oldestTimestamp) {
        oldestTimestamp = screenshot.timestamp;
      }
      if (screenshot.timestamp > newestTimestamp) {
        newestTimestamp = screenshot.timestamp;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.config.cache.maxScreenshots,
      maxAge: this.config.cache.maxAge,
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
    this.logger.info('Screenshot service cleaned up');
  }
}