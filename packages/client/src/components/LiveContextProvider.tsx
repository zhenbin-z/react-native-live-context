import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SDKConfig } from '../types';
import { createSDKConfig, validateConfig } from '../utils/config';
import { ServiceDiscovery } from '../services/ServiceDiscovery';
import { WebSocketClient } from '../services/WebSocketClient';
import { ScreenshotManager } from '../services/ScreenshotManager';
import { ContextCollector } from '../services/ContextCollector';
import { Logger } from '../utils/logger';

interface LiveContextValue {
  isConnected: boolean;
  isReady: boolean;
  config: SDKConfig;
  takeScreenshot: () => Promise<string>;
  getContext: () => Promise<any>;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

const LiveContextContext = createContext<LiveContextValue | null>(null);

interface LiveContextProviderProps {
  config?: Partial<SDKConfig>;
  children: ReactNode;
}

export const LiveContextProvider: React.FC<LiveContextProviderProps> = ({
  config: userConfig = {},
  children,
}) => {
  const [config] = useState<SDKConfig>(() => createSDKConfig(userConfig));
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  const [error, setError] = useState<string>();

  // Services
  const [serviceDiscovery] = useState(() => new ServiceDiscovery(config));
  const [webSocketClient] = useState(() => new WebSocketClient(config));
  const [screenshotManager] = useState(() => new ScreenshotManager(config));
  const [contextCollector] = useState(() => new ContextCollector(config));
  const [logger] = useState(() => new Logger(config.logLevel || 'warn'));

  // Initialize SDK
  useEffect(() => {
    const initializeSDK = async () => {
      try {
        // Validate configuration
        const validationResult = validateConfig(config);
        if (!validationResult.isValid) {
          throw new Error(
            `Invalid configuration: ${validationResult.errors.join(', ')}`
          );
        }

        logger.info('Initializing Live Context SDK', { config });

        // Check if SDK should be enabled
        if (!shouldEnableSDK()) {
          logger.info('SDK disabled for current environment');
          return;
        }

        setConnectionStatus('connecting');

        // Discover server if needed
        let serverUrl = config.serverUrl;
        if (!serverUrl && config.autoDiscovery !== false) {
          logger.info('Starting server discovery...');
          const serverInfo = await serviceDiscovery.discoverServer();
          if (serverInfo) {
            serverUrl = `ws://${serverInfo.host}:${serverInfo.port}`;
            logger.info('Server discovered', { serverUrl });
          } else if (config.fallbackUrl) {
            serverUrl = config.fallbackUrl;
            logger.info('Using fallback URL', { serverUrl });
          }
        }

        if (!serverUrl) {
          throw new Error(
            'No server URL available. Please configure serverUrl or enable autoDiscovery.'
          );
        }

        // Connect to WebSocket server
        await webSocketClient.connect(serverUrl);
        setIsConnected(true);
        setConnectionStatus('connected');

        // Initialize screenshot manager
        await screenshotManager.initialize();

        // Initialize context collector
        await contextCollector.initialize();

        setIsReady(true);
        logger.info('SDK initialized successfully');
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to initialize SDK', { error: errorMessage });
        setError(errorMessage);
        setConnectionStatus('error');
      }
    };

    initializeSDK();

    // Cleanup on unmount
    return () => {
      webSocketClient.disconnect();
      screenshotManager.cleanup();
      contextCollector.cleanup();
    };
  }, [
    config,
    serviceDiscovery,
    webSocketClient,
    screenshotManager,
    contextCollector,
    logger,
  ]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      logger.debug('App state changed', { nextAppState });

      if (nextAppState === 'background') {
        logger.info(
          'App moved to background, pausing screenshot functionality'
        );
        screenshotManager.pause();

        // Also pause context collection to save resources
        contextCollector.pause?.();
      } else if (nextAppState === 'active') {
        logger.info(
          'App moved to foreground, resuming screenshot functionality'
        );
        screenshotManager.resume();

        // Resume context collection
        contextCollector.resume?.();

        // Clear screenshot cache to ensure fresh screenshots
        screenshotManager.clearCache();
      } else if (nextAppState === 'inactive') {
        // iOS specific state when app is transitioning
        logger.debug('App became inactive');
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );
    return () => subscription?.remove();
  }, [screenshotManager, contextCollector, logger]);

  // Setup WebSocket message handlers
  useEffect(() => {
    if (!isConnected) return;

    const handleMessage = async (message: any) => {
      try {
        logger.debug('Received WebSocket message', { message });

        switch (message.type) {
          case 'screenshot_request':
            const screenshot = await screenshotManager.takeScreenshot();
            webSocketClient.send({
              type: 'screenshot_response',
              id: message.id,
              timestamp: Date.now(),
              data: screenshot,
            });
            break;

          case 'context_request':
            const context = await contextCollector.getContext();
            webSocketClient.send({
              type: 'context_response',
              id: message.id,
              timestamp: Date.now(),
              data: context,
            });
            break;

          case 'command':
            // Handle custom commands
            logger.info('Received command', { command: message.data });
            break;

          default:
            logger.warn('Unknown message type', { type: message.type });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        logger.error('Error handling WebSocket message', {
          error: errorMessage,
        });

        webSocketClient.send({
          type: 'error',
          id: message.id,
          timestamp: Date.now(),
          error: {
            code: 'MESSAGE_HANDLER_ERROR',
            message: errorMessage,
          },
        });
      }
    };

    const handleError = (error: Error) => {
      logger.error('WebSocket error', { error: error.message });
      setError(error.message);
      setConnectionStatus('error');
    };

    const handleDisconnect = () => {
      logger.info('WebSocket disconnected');
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };

    const handleReconnect = () => {
      logger.info('WebSocket reconnected');
      setIsConnected(true);
      setConnectionStatus('connected');
      setError(undefined);
    };

    webSocketClient.onMessage(handleMessage);
    webSocketClient.onError(handleError);
    webSocketClient.onDisconnect(handleDisconnect);
    webSocketClient.onReconnect(handleReconnect);

    return () => {
      // Cleanup listeners
      webSocketClient.removeAllListeners();
    };
  }, [
    isConnected,
    webSocketClient,
    screenshotManager,
    contextCollector,
    logger,
  ]);

  // Helper function to determine if SDK should be enabled
  const shouldEnableSDK = (): boolean => {
    const isDevelopment = __DEV__;

    if (config.enableInProduction === true) {
      return true;
    }

    if (config.enableInProduction === false) {
      return false;
    }

    // Default: enable in development, disable in production
    return isDevelopment;
  };

  // Context value
  const contextValue: LiveContextValue = {
    isConnected,
    isReady,
    config,
    takeScreenshot: () => screenshotManager.takeScreenshot(),
    getContext: () => contextCollector.getContext(),
    connectionStatus,
    error,
  };

  return (
    <LiveContextContext.Provider value={contextValue}>
      {children}
    </LiveContextContext.Provider>
  );
};

// Hook to use the Live Context
export const useLiveContextContext = () => {
  const context = useContext(LiveContextContext);
  if (!context) {
    throw new Error(
      'useLiveContextContext must be used within LiveContextProvider'
    );
  }
  return context;
};

// Legacy export for backward compatibility
export const AIScreenshotProvider = LiveContextProvider;
export const useAIScreenshotContext = useLiveContextContext;
