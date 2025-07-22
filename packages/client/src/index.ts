// React Native AI Screenshot SDK - Client
// Main entry point for the client SDK

export { AIScreenshotProvider } from './components/AIScreenshotProvider';
export { ScreenshotView } from './components/ScreenshotView';
export { ConnectionStatus } from './components/ConnectionStatus';
export { useAIScreenshot } from './hooks/useAIScreenshot';
export type { SDKConfig, ScreenshotOptions, ServerInfo, AppContext } from './types';
export { createSDKConfig } from './utils/config';

// Re-export types for convenience
export type { ScreenshotViewRef } from './components/ScreenshotView';