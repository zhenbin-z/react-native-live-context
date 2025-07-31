import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text, AppState } from 'react-native';
import { LiveContextProvider } from '../../components/LiveContextProvider';
import { useLiveContext } from '../../hooks/useLiveContext';
import { ScreenshotView } from '../../components/ScreenshotView';
import { ConnectionStatus } from '../../components/ConnectionStatus';

// Mock all the services
jest.mock('../../services/ServiceDiscovery');
jest.mock('../../services/WebSocketClient');
jest.mock('../../services/ScreenshotManager');
jest.mock('../../services/ContextCollector');
jest.mock('react-native-view-shot');

// Mock React Native modules
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    currentState: 'active',
  },
  PermissionsAndroid: {
    request: jest.fn(),
    PERMISSIONS: { WRITE_EXTERNAL_STORAGE: 'storage' },
    RESULTS: { GRANTED: 'granted' },
  },
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
}));

const TestComponent = () => {
  const { isConnected, takeScreenshot, connectionStatus } = useLiveContext();
  
  const handleTakeScreenshot = async () => {
    try {
      await takeScreenshot();
    } catch (error) {
      // Handle error
    }
  };

  return (
    <>
      <Text testID="connection-status">{connectionStatus}</Text>
      <Text testID="is-connected">{isConnected ? 'connected' : 'disconnected'}</Text>
      <Text testID="take-screenshot" onPress={handleTakeScreenshot}>
        Take Screenshot
      </Text>
    </>
  );
};

describe('Live Context Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should integrate all components successfully', async () => {
    const { getByTestId } = render(
      <LiveContextProvider config={{ autoDiscovery: true }}>
        <TestComponent />
        <ConnectionStatus />
      </LiveContextProvider>
    );

    await waitFor(() => {
      expect(getByTestId('connection-status')).toBeTruthy();
      expect(getByTestId('is-connected')).toBeTruthy();
    });
  });

  it('should handle app state changes', async () => {
    const mockAddEventListener = AppState.addEventListener as jest.Mock;
    let appStateHandler: (state: string) => void;

    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === 'change') {
        appStateHandler = handler;
      }
      return { remove: jest.fn() };
    });

    render(
      <LiveContextProvider>
        <TestComponent />
      </LiveContextProvider>
    );

    // Simulate app going to background
    act(() => {
      appStateHandler('background');
    });

    // Simulate app coming back to foreground
    act(() => {
      appStateHandler('active');
    });

    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('should work with ScreenshotView component', async () => {
    const onScreenshot = jest.fn();
    const onError = jest.fn();

    const { getByTestId } = render(
      <LiveContextProvider>
        <ScreenshotView onScreenshot={onScreenshot} onError={onError}>
          <Text testID="screenshot-content">Content to screenshot</Text>
        </ScreenshotView>
      </LiveContextProvider>
    );

    expect(getByTestId('screenshot-content')).toBeTruthy();
  });

  it('should show connection status in development', () => {
    const { queryByText } = render(
      <LiveContextProvider config={{ showConnectionStatus: true }}>
        <ConnectionStatus />
      </LiveContextProvider>
    );

    // Should render connection status in dev mode
    expect(queryByText(/Live Context/)).toBeTruthy();
  });

  it('should handle configuration errors gracefully', async () => {
    const invalidConfig = {
      screenshotQuality: 2.0, // Invalid quality > 1
      discoveryTimeout: 500,  // Too short
    };

    const { getByTestId } = render(
      <LiveContextProvider config={invalidConfig}>
        <TestComponent />
      </LiveContextProvider>
    );

    await waitFor(() => {
      const status = getByTestId('connection-status');
      expect(status.props.children).toBe('error');
    });
  });
});