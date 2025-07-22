import { SDKConfig, ScreenshotOptions } from '../types';
import { Logger } from '../utils/logger';
import { captureScreen, captureRef } from 'react-native-view-shot';
import { PermissionsAndroid, Platform, Alert } from 'react-native';

export class ScreenshotManager {
  private config: SDKConfig;
  private logger: Logger;
  private isPaused = false;
  private isInitialized = false;
  private hasPermission = false;
  private screenshotCache: Map<string, { data: string; timestamp: number }> = new Map();
  private cacheMaxAge = 5000; // 5 seconds cache

  constructor(config: SDKConfig) {
    this.config = config;
    this.logger = new Logger(config.logLevel || 'warn', '[ScreenshotManager]');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing ScreenshotManager');
    
    try {
      // Check and request permissions
      await this.checkPermissions();
      
      // Test screenshot capability
      await this.testScreenshotCapability();
      
      this.isInitialized = true;
      this.logger.info('ScreenshotManager initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to initialize ScreenshotManager', { error: errorMessage });
      throw new Error(`ScreenshotManager initialization failed: ${errorMessage}`);
    }
  }

  async takeScreenshot(options?: ScreenshotOptions): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('ScreenshotManager not initialized');
    }

    if (this.isPaused) {
      throw new Error('Screenshot functionality is paused');
    }

    if (!this.hasPermission) {
      throw new Error('Screenshot permission not granted');
    }

    this.logger.debug('Taking screenshot', { options });

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(options);
      const cached = this.screenshotCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
        this.logger.debug('Returning cached screenshot');
        return cached.data;
      }

      // Capture screenshot
      const screenshotOptions = this.buildScreenshotOptions(options);
      const uri = await captureScreen(screenshotOptions);
      
      // Convert to base64 if needed
      const base64Data = await this.processScreenshot(uri, options);
      
      // Cache the result
      this.screenshotCache.set(cacheKey, {
        data: base64Data,
        timestamp: Date.now(),
      });

      // Clean old cache entries
      this.cleanCache();
      
      this.logger.debug('Screenshot captured successfully', {
        size: base64Data.length,
        format: screenshotOptions.format,
        quality: screenshotOptions.quality,
      });
      
      return base64Data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to take screenshot', { error: errorMessage });
      
      // Provide helpful error messages
      if (errorMessage.includes('permission')) {
        throw new Error('Screenshot permission denied. Please grant storage permission and try again.');
      } else if (errorMessage.includes('not supported')) {
        throw new Error('Screenshot not supported on this device or platform.');
      } else {
        throw new Error(`Screenshot failed: ${errorMessage}`);
      }
    }
  }

  async takeComponentScreenshot(ref: any, options?: ScreenshotOptions): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('ScreenshotManager not initialized');
    }

    if (this.isPaused) {
      throw new Error('Screenshot functionality is paused');
    }

    this.logger.debug('Taking component screenshot', { options });

    try {
      const screenshotOptions = this.buildScreenshotOptions(options);
      const uri = await captureRef(ref, screenshotOptions);
      const base64Data = await this.processScreenshot(uri, options);
      
      this.logger.debug('Component screenshot captured successfully');
      return base64Data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to take component screenshot', { error: errorMessage });
      throw new Error(`Component screenshot failed: ${errorMessage}`);
    }
  }

  private async checkPermissions(): Promise<void> {
    this.logger.debug('Checking screenshot permissions');

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          {
            title: 'Screenshot Permission',
            message: 'This app needs access to storage to capture screenshots for AI assistance.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          this.hasPermission = true;
          this.logger.debug('Screenshot permission granted');
        } else {
          this.hasPermission = false;
          this.logger.warn('Screenshot permission denied');
          
          // Show guidance to user
          this.showPermissionGuidance();
        }
      } catch (error) {
        this.logger.error('Error requesting screenshot permission', { error });
        this.hasPermission = false;
      }
    } else {
      // iOS doesn't require explicit permission for screenshots
      this.hasPermission = true;
      this.logger.debug('iOS screenshot permission assumed granted');
    }
  }

  private async testScreenshotCapability(): Promise<void> {
    this.logger.debug('Testing screenshot capability');

    try {
      // Try to capture a small test screenshot
      const testUri = await captureScreen({
        format: 'png',
        quality: 0.1,
        width: 100,
        height: 100,
      });

      if (testUri) {
        this.logger.debug('Screenshot capability test passed');
      } else {
        throw new Error('Screenshot test returned empty result');
      }
    } catch (error) {
      this.logger.error('Screenshot capability test failed', { error });
      throw new Error('Device does not support screenshot functionality');
    }
  }

  private buildScreenshotOptions(options?: ScreenshotOptions): any {
    const quality = options?.quality ?? this.config.screenshotQuality ?? 0.8;
    const format = options?.format ?? 'png';
    
    const screenshotOptions: any = {
      format,
      quality: Math.max(0.1, Math.min(1.0, quality)), // Clamp between 0.1 and 1.0
    };

    // Add dimensions if specified
    if (options?.width) {
      screenshotOptions.width = options.width;
    }
    if (options?.height) {
      screenshotOptions.height = options.height;
    }

    // Privacy mode: reduce quality and add blur
    if (this.config.privacyMode) {
      screenshotOptions.quality = Math.min(screenshotOptions.quality, 0.3);
      // Note: Blur would need to be implemented at the component level
    }

    return screenshotOptions;
  }

  private async processScreenshot(uri: string, options?: ScreenshotOptions): Promise<string> {
    // If URI is already base64, return as-is
    if (uri.startsWith('data:')) {
      return uri;
    }

    // For file URIs, we need to read and convert to base64
    // This is a simplified implementation - in a real app, you'd use
    // react-native-fs or similar to read the file
    try {
      // For now, return the URI as-is and let the server handle conversion
      // In a production implementation, you would:
      // 1. Read the file using react-native-fs
      // 2. Convert to base64
      // 3. Add proper data URI prefix
      
      return `data:image/${options?.format || 'png'};base64,${uri}`;
    } catch (error) {
      this.logger.error('Failed to process screenshot', { error });
      throw error;
    }
  }

  private getCacheKey(options?: ScreenshotOptions): string {
    return JSON.stringify({
      quality: options?.quality ?? this.config.screenshotQuality ?? 0.8,
      format: options?.format ?? 'png',
      width: options?.width,
      height: options?.height,
      privacyMode: this.config.privacyMode,
    });
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.screenshotCache.entries()) {
      if (now - value.timestamp > this.cacheMaxAge) {
        this.screenshotCache.delete(key);
      }
    }
  }

  private showPermissionGuidance(): void {
    if (Platform.OS === 'android') {
      Alert.alert(
        'Permission Required',
        'To enable AI screenshot functionality, please grant storage permission in Settings > Apps > [Your App] > Permissions.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => {
            // In a real implementation, you would open app settings
            this.logger.info('User requested to open settings for permissions');
          }},
        ]
      );
    }
  }

  // Public methods for permission management
  async requestPermissions(): Promise<boolean> {
    await this.checkPermissions();
    return this.hasPermission;
  }

  getPermissionStatus(): boolean {
    return this.hasPermission;
  }

  // Cache management
  clearCache(): void {
    this.screenshotCache.clear();
    this.logger.debug('Screenshot cache cleared');
  }

  getCacheStats(): { size: number; maxAge: number } {
    return {
      size: this.screenshotCache.size,
      maxAge: this.cacheMaxAge,
    };
  }

  pause(): void {
    this.logger.info('Pausing screenshot functionality');
    this.isPaused = true;
  }

  resume(): void {
    this.logger.info('Resuming screenshot functionality');
    this.isPaused = false;
  }

  cleanup(): void {
    this.logger.info('Cleaning up ScreenshotManager');
    this.isPaused = false;
    this.isInitialized = false;
    this.hasPermission = false;
    this.clearCache();
  }

  // Getters
  get isReady(): boolean {
    return this.isInitialized && !this.isPaused && this.hasPermission;
  }

  get stats(): {
    isInitialized: boolean;
    isPaused: boolean;
    hasPermission: boolean;
    cacheSize: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isPaused: this.isPaused,
      hasPermission: this.hasPermission,
      cacheSize: this.screenshotCache.size,
    };
  }
}