// React Native Live Context - Client
// Main entry point for the client SDK

export { LiveContextProvider } from './components/LiveContextProvider';
export { ScreenshotView } from './components/ScreenshotView';
export { ConnectionStatus } from './components/ConnectionStatus';
export { useLiveContext } from './hooks/useLiveContext';
export type { SDKConfig, ScreenshotOptions, ServerInfo, AppContext } from './types';
export { createSDKConfig } from './utils/config';

// Re-export types for convenience
export type { ScreenshotViewRef } from './components/ScreenshotView';

