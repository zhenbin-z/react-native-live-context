import 'react-native-testing-library/extend-expect';

// Mock WebSocket for testing
global.WebSocket = jest.fn().mockImplementation(() => ({
  readyState: 1,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock __DEV__ global
global.__DEV__ = true;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};