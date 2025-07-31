import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { LiveContextProvider, useLiveContextContext } from '../../components/LiveContextProvider';

// Mock the services
jest.mock('../../services/ServiceDiscovery');
jest.mock('../../services/WebSocketClient');
jest.mock('../../services/ScreenshotManager');
jest.mock('../../services/ContextCollector');

const TestComponent = () => {
  const context = useLiveContextContext();
  return (
    <Text testID="status">
      {context.isConnected ? 'connected' : 'disconnected'}
    </Text>
  );
};

describe('LiveContextProvider', () => {
  it('should render children', () => {
    const { getByTestId } = render(
      <LiveContextProvider>
        <Text testID="child">Test Child</Text>
      </LiveContextProvider>
    );

    expect(getByTestId('child')).toBeTruthy();
  });

  it('should provide context to children', () => {
    const { getByTestId } = render(
      <LiveContextProvider>
        <TestComponent />
      </LiveContextProvider>
    );

    expect(getByTestId('status')).toBeTruthy();
  });

  it('should throw error when useLiveContextContext used outside provider', () => {
    const TestComponentOutside = () => {
      useLiveContextContext();
      return <Text>Test</Text>;
    };

    expect(() => render(<TestComponentOutside />)).toThrow(
      'useLiveContextContext must be used within LiveContextProvider'
    );
  });

  it('should accept custom config', () => {
    const customConfig = {
      autoDiscovery: false,
      logLevel: 'debug' as const,
    };

    const { getByTestId } = render(
      <LiveContextProvider config={customConfig}>
        <TestComponent />
      </LiveContextProvider>
    );

    expect(getByTestId('status')).toBeTruthy();
  });
});