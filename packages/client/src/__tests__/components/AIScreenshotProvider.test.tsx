import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { LiveContextProvider, useLiveContextContext } from '../../components/LiveContextProvider';

// Legacy aliases for the test
const AIScreenshotProvider = LiveContextProvider;
const useAIScreenshotContext = useLiveContextContext;

// Mock the services
jest.mock('../../services/ServiceDiscovery');
jest.mock('../../services/WebSocketClient');
jest.mock('../../services/ScreenshotManager');
jest.mock('../../services/ContextCollector');

const TestComponent = () => {
  const context = useAIScreenshotContext();
  return (
    <Text testID="status">
      {context.isConnected ? 'connected' : 'disconnected'}
    </Text>
  );
};

describe('AIScreenshotProvider', () => {
  it('should render children', () => {
    const { getByTestId } = render(
      <AIScreenshotProvider>
        <Text testID="child">Test Child</Text>
      </AIScreenshotProvider>
    );

    expect(getByTestId('child')).toBeTruthy();
  });

  it('should provide context to children', () => {
    const { getByTestId } = render(
      <AIScreenshotProvider>
        <TestComponent />
      </AIScreenshotProvider>
    );

    expect(getByTestId('status')).toBeTruthy();
  });

  it('should throw error when useAIScreenshotContext used outside provider', () => {
    const TestComponentOutside = () => {
      useAIScreenshotContext();
      return <Text>Test</Text>;
    };

    expect(() => render(<TestComponentOutside />)).toThrow(
      'useAIScreenshotContext must be used within AIScreenshotProvider'
    );
  });

  it('should accept custom config', () => {
    const customConfig = {
      autoDiscovery: false,
      logLevel: 'debug' as const,
    };

    const { getByTestId } = render(
      <AIScreenshotProvider config={customConfig}>
        <TestComponent />
      </AIScreenshotProvider>
    );

    expect(getByTestId('status')).toBeTruthy();
  });
});