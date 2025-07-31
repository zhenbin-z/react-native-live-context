import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLiveContext } from '../hooks/useLiveContext';

interface ConnectionStatusProps {
  style?: any;
  showWhenConnected?: boolean;
  position?: 'top' | 'bottom';
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  style,
  showWhenConnected = false,
  position = 'top',
}) => {
  const { connectionStatus, isConnected, error, config } = useLiveContext();

  // Don't show in production unless explicitly configured
  if (!config.showConnectionStatus && !__DEV__) {
    return null;
  }

  // Don't show when connected unless requested
  if (isConnected && !showWhenConnected) {
    return null;
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#4CAF50';
      case 'connecting': return '#FF9800';
      case 'error': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Live Context Ready';
      case 'connecting': return 'Connecting to Context Server...';
      case 'error': return error ? `Error: ${error}` : 'Connection Error';
      default: return 'Live Context Disconnected';
    }
  };

  const statusStyle = [
    styles.container,
    position === 'bottom' ? styles.bottom : styles.top,
    { backgroundColor: getStatusColor() },
    style,
  ];

  return (
    <View style={statusStyle}>
      <Text style={styles.text}>{getStatusText()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1000,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
  text: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});