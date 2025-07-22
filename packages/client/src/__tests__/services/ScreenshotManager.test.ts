import { ScreenshotManager } from '../../services/ScreenshotManager';
import { createSDKConfig } from '../../utils/config';
import { PermissionsAndroid, Platform, Alert } from 'react-native';

// Mock react-native-view-shot
jest.mock('react-native-view-shot', () => ({
  captureScreen: jest.fn(),
  captureRef: jest.fn(),
}));

// Mock React Native modules
jest.mock('react-native', () => ({
  PermissionsAndroid: {
    request: jest.fn(),
    PERMISSIONS: {
      WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
    },
  },
  Platform: {
    OS: 'ios',
  },
  Alert: {
    alert: jest.fn(),
  },
}));

import { captureScreen, captureRef } from 'react-native-view-shot';

const mockCaptureScreen = captureScreen as jest.MockedFunction<typeof captureScreen>;
const mockCaptureRef = captureRef as jest.MockedFunction<typeof captureRef>;

describe('ScreenshotManager', () => {
  let screenshotManager: ScreenshotManager;
  let config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    config = createSDKConfig({
      screenshotQuality: 0.8,
      privacyMode: false,
    });
    screenshotManager = new ScreenshotManager(config);
    
    // Default to iOS for most tests
    (Platform as any).OS = 'ios';
  });

  describe('initialize', () => {
    it('should initialize successfully on iOS', async () => {
      mockCaptureScreen.mockResolvedValueOnce('test-uri');

      await screenshotManager.initialize();

      expect(screenshotManager.isReady).toBe(true);
      expect(screenshotManager.getPermissionStatus()).toBe(true);
    });

    it('should initialize successfully on Android with permission', async () => {
      (Platform as any).OS = 'android';
      (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
        PermissionsAndroid.RESULTS.GRANTED
      );
      mockCaptureScreen.mockResolvedValueOnce('test-uri');

      await screenshotManager.initialize();

      expect(screenshotManager.isReady).toBe(true);
      expect(PermissionsAndroid.request).toHaveBeenCalled();
    });

    it('should fail to initialize on Android without permission', async () => {
      (Platform as any).OS = 'android';
      (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
        PermissionsAndroid.RESULTS.DENIED
      );

      await screenshotManager.initialize();

      expect(screenshotManager.isReady).toBe(false);
      expect(screenshotManager.getPermissionStatus()).toBe(false);
    });

    it('should fail if screenshot capability test fails', async () => {
      mockCaptureScreen.mockRejectedValueOnce(new Error('Screenshot not supported'));

      await expect(screenshotManager.initialize()).rejects.toThrow(
        'ScreenshotManager initialization failed'
      );
    });
  });

  describe('takeScreenshot', () => {
    beforeEach(async () => {
      mockCaptureScreen.mockResolvedValue('test-uri');
      await screenshotManager.initialize();
    });

    it('should take screenshot successfully', async () => {
      mockCaptureScreen.mockResolvedValueOnce('file://screenshot.png');

      const result = await screenshotManager.takeScreenshot();

      expect(result).toContain('data:image/png;base64,');
      expect(mockCaptureScreen).toHaveBeenCalledWith({
        format: 'png',
        quality: 0.8,
      });
    });

    it('should use custom options', async () => {
      mockCaptureScreen.mockResolvedValueOnce('file://screenshot.jpg');

      const options = {
        quality: 0.5,
        format: 'jpg' as const,
        width: 800,
        height: 600,
      };

      await screenshotManager.takeScreenshot(options);

      expect(mockCaptureScreen).toHaveBeenCalledWith({
        format: 'jpg',
        quality: 0.5,
        width: 800,
        height: 600,
      });
    });

    it('should apply privacy mode settings', async () => {
      const privacyConfig = createSDKConfig({ privacyMode: true });
      const privacyManager = new ScreenshotManager(privacyConfig);
      
      mockCaptureScreen.mockResolvedValue('test-uri');
      await privacyManager.initialize();
      
      mockCaptureScreen.mockResolvedValueOnce('file://screenshot.png');

      await privacyManager.takeScreenshot({ quality: 0.8 });

      expect(mockCaptureScreen).toHaveBeenCalledWith({
        format: 'png',
        quality: 0.3, // Should be reduced due to privacy mode
      });
    });

    it('should throw error when not initialized', async () => {
      const uninitializedManager = new ScreenshotManager(config);

      await expect(uninitializedManager.takeScreenshot()).rejects.toThrow(
        'ScreenshotManager not initialized'
      );
    });

    it('should throw error when paused', async () => {
      screenshotManager.pause();

      await expect(screenshotManager.takeScreenshot()).rejects.toThrow(
        'Screenshot functionality is paused'
      );
    });

    it('should use cache for repeated requests', async () => {
      mockCaptureScreen.mockResolvedValueOnce('file://screenshot1.png');

      // First call
      const result1 = await screenshotManager.takeScreenshot();
      
      // Second call with same options should use cache
      const result2 = await screenshotManager.takeScreenshot();

      expect(result1).toBe(result2);
      expect(mockCaptureScreen).toHaveBeenCalledTimes(1); // Only called once due to cache
    });

    it('should handle screenshot errors gracefully', async () => {
      mockCaptureScreen.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(screenshotManager.takeScreenshot()).rejects.toThrow(
        'Screenshot permission denied'
      );
    });
  });

  describe('takeComponentScreenshot', () => {
    beforeEach(async () => {
      mockCaptureScreen.mockResolvedValue('test-uri');
      await screenshotManager.initialize();
    });

    it('should take component screenshot successfully', async () => {
      const mockRef = { current: {} };
      mockCaptureRef.mockResolvedValueOnce('file://component.png');

      const result = await screenshotManager.takeComponentScreenshot(mockRef);

      expect(result).toContain('data:image/png;base64,');
      expect(mockCaptureRef).toHaveBeenCalledWith(mockRef, {
        format: 'png',
        quality: 0.8,
      });
    });

    it('should handle component screenshot errors', async () => {
      const mockRef = { current: {} };
      mockCaptureRef.mockRejectedValueOnce(new Error('Component not found'));

      await expect(
        screenshotManager.takeComponentScreenshot(mockRef)
      ).rejects.toThrow('Component screenshot failed');
    });
  });

  describe('permission management', () => {
    it('should request permissions on Android', async () => {
      (Platform as any).OS = 'android';
      (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
        PermissionsAndroid.RESULTS.GRANTED
      );

      const granted = await screenshotManager.requestPermissions();

      expect(granted).toBe(true);
      expect(PermissionsAndroid.request).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        expect.any(Object)
      );
    });

    it('should show permission guidance when denied', async () => {
      (Platform as any).OS = 'android';
      (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
        PermissionsAndroid.RESULTS.DENIED
      );

      await screenshotManager.requestPermissions();

      expect(Alert.alert).toHaveBeenCalledWith(
        'Permission Required',
        expect.stringContaining('grant storage permission'),
        expect.any(Array)
      );
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      mockCaptureScreen.mockResolvedValue('test-uri');
      await screenshotManager.initialize();
    });

    it('should provide cache statistics', () => {
      const stats = screenshotManager.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxAge');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.maxAge).toBe('number');
    });

    it('should clear cache', async () => {
      mockCaptureScreen.mockResolvedValueOnce('file://screenshot.png');
      
      // Take a screenshot to populate cache
      await screenshotManager.takeScreenshot();
      
      expect(screenshotManager.getCacheStats().size).toBeGreaterThan(0);
      
      screenshotManager.clearCache();
      
      expect(screenshotManager.getCacheStats().size).toBe(0);
    });
  });

  describe('pause and resume', () => {
    beforeEach(async () => {
      mockCaptureScreen.mockResolvedValue('test-uri');
      await screenshotManager.initialize();
    });

    it('should pause and resume functionality', () => {
      expect(screenshotManager.isReady).toBe(true);

      screenshotManager.pause();
      expect(screenshotManager.isReady).toBe(false);

      screenshotManager.resume();
      expect(screenshotManager.isReady).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      mockCaptureScreen.mockResolvedValue('test-uri');
      await screenshotManager.initialize();

      screenshotManager.cleanup();

      expect(screenshotManager.isReady).toBe(false);
      expect(screenshotManager.stats.isInitialized).toBe(false);
      expect(screenshotManager.stats.cacheSize).toBe(0);
    });
  });

  describe('stats', () => {
    it('should provide comprehensive stats', async () => {
      const stats = screenshotManager.stats;

      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('isPaused');
      expect(stats).toHaveProperty('hasPermission');
      expect(stats).toHaveProperty('cacheSize');
    });
  });
});