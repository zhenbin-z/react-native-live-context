import { useCallback } from 'react';
import { useAIScreenshotContext } from '../components/AIScreenshotProvider';
import { ScreenshotOptions } from '../types';

/**
 * Hook to interact with AI Screenshot functionality
 */
export function useAIScreenshot() {
  const context = useAIScreenshotContext();

  const takeScreenshot = useCallback(async (options?: ScreenshotOptions): Promise<string> => {
    if (!context.isReady) {
      throw new Error('AI Screenshot SDK is not ready. Please ensure the provider is properly initialized.');
    }

    if (!context.isConnected) {
      throw new Error('Not connected to server. Please check your connection.');
    }

    return context.takeScreenshot();
  }, [context]);

  const getAppContext = useCallback(async (): Promise<any> => {
    if (!context.isReady) {
      throw new Error('AI Screenshot SDK is not ready. Please ensure the provider is properly initialized.');
    }

    if (!context.isConnected) {
      throw new Error('Not connected to server. Please check your connection.');
    }

    return context.getContext();
  }, [context]);

  return {
    // State
    isConnected: context.isConnected,
    isReady: context.isReady,
    connectionStatus: context.connectionStatus,
    error: context.error,
    config: context.config,

    // Actions
    takeScreenshot,
    getAppContext,

    // Computed properties
    canTakeScreenshot: context.isReady && context.isConnected,
    isLoading: context.connectionStatus === 'connecting',
    hasError: context.connectionStatus === 'error' || !!context.error,
  };
}