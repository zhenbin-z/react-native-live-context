import { useCallback } from 'react';
import { useLiveContextContext } from '../components/LiveContextProvider';
import { ScreenshotOptions } from '../types';

/**
 * Hook to interact with Live Context functionality
 */
export function useLiveContext() {
  const context = useLiveContextContext();

  const takeScreenshot = useCallback(async (options?: ScreenshotOptions): Promise<string> => {
    if (!context.isReady) {
      throw new Error('Live Context SDK is not ready. Please ensure the provider is properly initialized.');
    }

    if (!context.isConnected) {
      throw new Error('Not connected to server. Please check your connection.');
    }

    return context.takeScreenshot();
  }, [context]);

  const getAppContext = useCallback(async (): Promise<any> => {
    if (!context.isReady) {
      throw new Error('Live Context SDK is not ready. Please ensure the provider is properly initialized.');
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

