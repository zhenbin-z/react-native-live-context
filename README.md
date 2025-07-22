# React Native AI Screenshot SDK

A powerful SDK that enables AI assistants (like Claude, Kiro) to capture real-time screenshots of React Native applications via MCP (Model Context Protocol), providing better UI understanding for code assistance.

## 🚀 Features

- **Real-time Screenshots**: Capture app screenshots instantly for AI analysis
- **MCP Protocol Support**: Standard interface for AI assistants  
- **Auto-Discovery**: Automatically find and connect to local server
- **Privacy-First**: All data processed locally, never uploaded to cloud
- **Easy Integration**: Single Provider component integration
- **Cross-Platform**: Works on iOS and Android

## 📦 Packages

This is a monorepo containing:

- `@rn-ai-screenshot/client` - React Native SDK for apps
- `@rn-ai-screenshot/server` - Local server with WebSocket + MCP support

## 🏗️ Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐    MCP Protocol    ┌─────────────────┐
│  React Native   │◄──────────────►│  Local Server   │◄─────────────────►│  AI Assistant   │
│      App        │                 │ (WS + MCP)      │                    │ (Claude/Kiro)   │
└─────────────────┘                 └─────────────────┘                    └─────────────────┘
```

## 🚀 Quick Start

### 1. Install the packages

```bash
# Install client SDK in your React Native project
npm install @rn-ai-screenshot/client

# Install server globally or in your development environment
npm install -g @rn-ai-screenshot/server
```

### 2. Add to your React Native app

```tsx
import { AIScreenshotProvider, ConnectionStatus } from '@rn-ai-screenshot/client';

export default function App() {
  return (
    <AIScreenshotProvider config={{ 
      autoDiscovery: true,
      logLevel: 'info'
    }}>
      <ConnectionStatus position="top" />
      {/* Your app components */}
      <YourAppContent />
    </AIScreenshotProvider>
  );
}
```

### 3. Start the local server

```bash
# Start with default settings
rn-ai-screenshot-server start

# Or with custom options
rn-ai-screenshot-server start --port 8080 --host localhost --qr
```

### 4. Configure your AI assistant

Add this MCP server configuration to your AI assistant:

```json
{
  "mcpServers": {
    "react-native-screenshot": {
      "command": "rn-ai-screenshot-server",
      "args": ["start", "--mcp"],
      "env": {}
    }
  }
}
```

## 🤖 Available MCP Tools

Once configured, your AI assistant will have access to these tools:

- **`get_current_screenshot`** - Capture app screenshot with options
- **`get_app_context`** - Get current route, component tree, and user interactions
- **`send_command`** - Send custom commands to the app
- **`list_connected_devices`** - List all connected React Native devices
- **`get_server_status`** - Get server statistics and health info

## 📱 Usage Examples

### Basic Screenshot

```tsx
import { useAIScreenshot } from '@rn-ai-screenshot/client';

function MyComponent() {
  const { takeScreenshot, isConnected } = useAIScreenshot();
  
  const handleScreenshot = async () => {
    if (isConnected) {
      const screenshot = await takeScreenshot({ quality: 0.8 });
      console.log('Screenshot captured:', screenshot.length);
    }
  };
  
  return (
    <Button title="Take Screenshot" onPress={handleScreenshot} />
  );
}
```

### Custom Screenshot View

```tsx
import { ScreenshotView } from '@rn-ai-screenshot/client';

function MyScreen() {
  return (
    <ScreenshotView 
      onScreenshot={(data) => console.log('Screenshot taken')}
      screenshotOptions={{ quality: 0.9, format: 'png' }}
    >
      <Text>This content will be captured</Text>
    </ScreenshotView>
  );
}
```

## ⚙️ Configuration

### Client SDK Configuration

```tsx
const config = {
  // Server connection
  serverUrl: 'ws://192.168.1.100:8080',  // Explicit server URL
  autoDiscovery: true,                    // Auto-find server (default: true)
  discoveryTimeout: 5000,                 // Discovery timeout (default: 5000ms)
  
  // Features
  enableInProduction: false,              // Enable in production (default: false)
  privacyMode: false,                     // Privacy mode (default: false)
  screenshotQuality: 0.8,                 // Default quality (default: 0.8)
  
  // Debug
  logLevel: 'warn',                       // Log level (default: 'warn')
  showConnectionStatus: true,             // Show status indicator (default: true in dev)
};
```

### Server Configuration

```bash
# Command line options
rn-ai-screenshot-server start \
  --port 8080 \
  --host localhost \
  --max-connections 100 \
  --cache-size 50 \
  --cache-ttl 300 \
  --log-level info \
  --qr
```

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/your-org/react-native-ai-screenshot-sdk.git
cd react-native-ai-screenshot-sdk

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Start development mode (both client and server)
npm run dev
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run client tests only
cd packages/client && npm test

# Run server tests only  
cd packages/server && npm test

# Run with coverage
npm run test -- --coverage
```

## 🐛 Troubleshooting

### Common Issues

1. **Server not found**
   - Ensure the server is running: `rn-ai-screenshot-server status`
   - Check firewall settings
   - Try explicit server URL instead of auto-discovery

2. **Permission denied (Android)**
   - Grant storage permission in app settings
   - Check if `WRITE_EXTERNAL_STORAGE` permission is declared

3. **Screenshots not working**
   - Verify react-native-view-shot is properly linked
   - Check device compatibility
   - Enable debug logging: `logLevel: 'debug'`

### Debug Commands

```bash
# Check server status
rn-ai-screenshot-server status

# Show configuration examples
rn-ai-screenshot-server config --react-native
rn-ai-screenshot-server config --mcp
```

## 📖 API Reference

### Client SDK

- [`AIScreenshotProvider`](./packages/client/docs/AIScreenshotProvider.md)
- [`useAIScreenshot`](./packages/client/docs/useAIScreenshot.md)
- [`ScreenshotView`](./packages/client/docs/ScreenshotView.md)
- [`ConnectionStatus`](./packages/client/docs/ConnectionStatus.md)

### Server API

- [`AIScreenshotServer`](./packages/server/docs/AIScreenshotServer.md)
- [MCP Tools Reference](./packages/server/docs/mcp-tools.md)
- [WebSocket Protocol](./packages/server/docs/websocket-protocol.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🔗 Links

- [GitHub Repository](https://github.com/your-org/react-native-ai-screenshot-sdk)
- [NPM Package - Client](https://www.npmjs.com/package/@rn-ai-screenshot/client)
- [NPM Package - Server](https://www.npmjs.com/package/@rn-ai-screenshot/server)
- [Documentation](https://your-org.github.io/react-native-ai-screenshot-sdk)

---

Made with ❤️ for the React Native and AI development community