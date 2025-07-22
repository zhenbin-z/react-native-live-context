import { ScreenshotService } from '../../services/ScreenshotService';
import { MessageHandler } from '../../messaging/MessageHandler';
import { ServerConfig, MessageType } from '../../types';

// Mock MessageHandler
class MockMessageHandler {
  requestScreenshot = jest.fn();
}

// Mock timers
jest.useFakeTimers();

describe('ScreenshotService', () => {
  let screenshotService: ScreenshotService;
  let mockMessageHandler: MockMessageHandler;
  let config: ServerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      websocket: {
        port: 8080,
        host: 'localhost',
        maxConnections: 100,
        heartbeatInterval: 30000,
      },
      mcp: {
        port: 8081,
        tools: ['screenshot', 'context'],
        timeout: 5000,
      },
      cache: {
        maxScreenshots: 5,
        maxAge: 60000, // 1 minute
      },
      security: {
        allowedOrigins: ['*'],
        enableCORS: true,
      },
    };

    mockMessageHandler = new MockMessageHandler();
    screenshotService = new ScreenshotService(config, mockMessageHandler as any);
  });

  afterEach(() => {
    screenshotService.cleanup();
    jest.clearAllTimers();
  });

  describe('requestScreenshot', () => {
    it('should request screenshot successfully', async () => {
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);

      const result = await screenshotService.requestScreenshot('client-1');

      expect(result).toEqual({
        id: 'screenshot-123',
        clientId: 'client-1',
        data: 'base64-image-data',
        timestamp: expect.any(Number),
        metadata: {
          width: 0,
          height: 0,
          format: 'png',
          quality: 0.8,
        },
      });

      expect(mockMessageHandler.requestScreenshot).toHaveBeenCalledWith('client-1');
    });

    it('should use custom options', async () => {
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);

      const options = {
        quality: 0.5,
        format: 'jpg',
        width: 800,
        height: 600,
      };

      const result = await screenshotService.requestScreenshot('client-1', options);

      expect(result.metadata).toEqual({
        width: 800,
        height: 600,
        format: 'jpg',
        quality: 0.5,
      });
    });

    it('should return cached screenshot if valid', async () => {
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);

      // First request
      const result1 = await screenshotService.requestScreenshot('client-1');
      
      // Second request should use cache
      const result2 = await screenshotService.requestScreenshot('client-1');

      expect(result1).toEqual(result2);
      expect(mockMessageHandler.requestScreenshot).toHaveBeenCalledTimes(1);
    });

    it('should handle screenshot request errors', async () => {
      mockMessageHandler.requestScreenshot.mockResolvedValueOnce({
        type: MessageType.ERROR,
        id: 'error-123',
        timestamp: Date.now(),
        error: {
          code: 'SCREENSHOT_FAILED',
          message: 'Permission denied',
        },
      });

      await expect(screenshotService.requestScreenshot('client-1')).rejects.toThrow(
        'Failed to capture screenshot: Screenshot request failed: Permission denied'
      );
    });

    it('should handle missing data in response', async () => {
      mockMessageHandler.requestScreenshot.mockResolvedValueOnce({
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        // Missing data field
      });

      await expect(screenshotService.requestScreenshot('client-1')).rejects.toThrow(
        'Failed to capture screenshot: Screenshot response contains no data'
      );
    });
  });

  describe('cache management', () => {
    it('should cache screenshots', async () => {
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);

      await screenshotService.requestScreenshot('client-1');

      const stats = screenshotService.getCacheStats();
      expect(stats.size).toBe(1);
    });

    it('should evict oldest screenshot when cache is full', async () => {
      // Fill cache to max capacity
      for (let i = 0; i < config.cache.maxScreenshots; i++) {
        const mockResponse = {
          type: MessageType.SCREENSHOT_RESPONSE,
          id: `screenshot-${i}`,
          timestamp: Date.now(),
          data: `base64-image-data-${i}`,
        };

        mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);
        await screenshotService.requestScreenshot(`client-${i}`);
      }

      expect(screenshotService.getCacheStats().size).toBe(config.cache.maxScreenshots);

      // Add one more screenshot
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-new',
        timestamp: Date.now(),
        data: 'base64-image-data-new',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);
      await screenshotService.requestScreenshot('client-new');

      // Cache size should still be at max
      expect(screenshotService.getCacheStats().size).toBe(config.cache.maxScreenshots);
    });

    it('should clean up expired cache entries', async () => {
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);
      await screenshotService.requestScreenshot('client-1');

      expect(screenshotService.getCacheStats().size).toBe(1);

      // Fast-forward time to expire the cache
      jest.advanceTimersByTime(config.cache.maxAge + 60000);

      // Trigger cleanup
      jest.advanceTimersByTime(60000);

      expect(screenshotService.getCacheStats().size).toBe(0);
    });

    it('should clear cache for specific client', async () => {
      const mockResponse1 = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-1',
        timestamp: Date.now(),
        data: 'base64-image-data-1',
      };

      const mockResponse2 = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-2',
        timestamp: Date.now(),
        data: 'base64-image-data-2',
      };

      mockMessageHandler.requestScreenshot
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await screenshotService.requestScreenshot('client-1');
      await screenshotService.requestScreenshot('client-2');

      expect(screenshotService.getCacheStats().size).toBe(2);

      const clearedCount = screenshotService.clearCache('client-1');
      expect(clearedCount).toBe(1);
      expect(screenshotService.getCacheStats().size).toBe(1);
    });

    it('should clear all cache', async () => {
      const mockResponse = {
        type: MessageType.SCREENSHOT_RESPONSE,
        id: 'screenshot-123',
        timestamp: Date.now(),
        data: 'base64-image-data',
      };

      mockMessageHandler.requestScreenshot.mockResolvedValueOnce(mockResponse);
      await screenshotService.requestScreenshot('client-1');

      expect(screenshotService.getCacheStats().size).toBe(1);

      const clearedCount = screenshotService.clearCache();
      expect(clearedCount).toBe(1);
      expect(screenshotService.getCacheStats().size).toBe(0);
    });
  });

  describe('screenshot retrieval', () => {
    beforeEach(async () => {
      // Add some test screenshots
      const responses = [
        {
          type: MessageType.SCREENSHOT_RESPONSE,
          id: 'screenshot-1',
          timestamp: Date.now() - 1000,
          data: 'base64-image-data-1',
        },
        {
          type: MessageType.SCREENSHOT_RESPONSE,
          id: 'screenshot-2',
          timestamp: Date.now(),
          data: 'base64-image-data-2',
        },
      ];

      mockMessageHandler.requestScreenshot
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1]);

      await screenshotService.requestScreenshot('client-1');
      await screenshotService.requestScreenshot('client-2');
    });

    it('should get latest screenshot', () => {
      const latest = screenshotService.getLatestScreenshot();
      expect(latest?.id).toBe('screenshot-2');
    });

    it('should get latest screenshot for specific client', () => {
      const latest = screenshotService.getLatestScreenshot('client-1');
      expect(latest?.id).toBe('screenshot-1');
      expect(latest?.clientId).toBe('client-1');
    });

    it('should get screenshot by ID', () => {
      const screenshot = screenshotService.getScreenshotById('screenshot-1');
      expect(screenshot?.id).toBe('screenshot-1');
    });

    it('should get all screenshots', () => {
      const screenshots = screenshotService.getAllScreenshots();
      expect(screenshots).toHaveLength(2);
      expect(screenshots[0].id).toBe('screenshot-2'); // Newest first
      expect(screenshots[1].id).toBe('screenshot-1');
    });

    it('should get screenshots for specific client', () => {
      const screenshots = screenshotService.getAllScreenshots('client-1');
      expect(screenshots).toHaveLength(1);
      expect(screenshots[0].id).toBe('screenshot-1');
    });
  });

  describe('statistics', () => {
    it('should provide cache statistics', () => {
      const stats = screenshotService.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('maxAge');
      expect(stats).toHaveProperty('oldestTimestamp');
      expect(stats).toHaveProperty('newestTimestamp');
    });
  });
});