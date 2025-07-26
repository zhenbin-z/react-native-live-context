# React Native Live Context

> 🤖 **AI生成プロジェクト**: このプロジェクト全体は、AI支援ソフトウェア開発の力を実証するために、Kiro AIアシスタントによって生成されました。

**言語**: [English](README.md) | [日本語](README.ja.md)

AI アシスタント（Claude、Kiro など）が MCP（Model Context Protocol）を介して React Native アプリケーションのリアルタイムスクリーンショットをキャプチャできるようにする強力な SDK で、コード支援のためのより良い UI 理解を提供します。

## 🚀 機能

- **リアルタイムスクリーンショット**: AI分析のためにアプリのスクリーンショットを瞬時にキャプチャ
- **MCPプロトコルサポート**: AIアシスタント向けの標準インターフェース
- **自動発見**: ローカルサーバーを自動的に検出して接続
- **プライバシー優先**: すべてのデータはローカルで処理され、クラウドにアップロードされません
- **簡単統合**: 単一のProviderコンポーネント統合
- **クロスプラットフォーム**: iOSとAndroidで動作

## 📦 パッケージ

このmonorepoには以下が含まれています：

- `@react-native-live-context/client` - アプリ用React Native SDK
- `@react-native-live-context/server` - WebSocket + MCPサポート付きローカルサーバー

## 🏗️ アーキテクチャ

```
┌─────────────────┐    WebSocket    ┌─────────────────┐    MCP Protocol    ┌─────────────────┐
│  React Native   │◄──────────────►│  Local Server   │◄─────────────────►│  AI Assistant   │
│      App        │                 │ (WS + MCP)      │                    │ (Claude/Kiro)   │
└─────────────────┘                 └─────────────────┘                    └─────────────────┘
```

## 🚀 クイックスタート

### 1. パッケージのインストール

```bash
# React Nativeプロジェクトにクライアント SDKをインストール
npm install @rn-ai-screenshot/client

# サーバーをグローバルまたは開発環境にインストール
npm install -g @rn-ai-screenshot/server
```

### 2. React Nativeアプリに追加

```tsx
import { AIScreenshotProvider, ConnectionStatus } from '@rn-ai-screenshot/client';

export default function App() {
  return (
    <AIScreenshotProvider config={{ 
      autoDiscovery: true,
      logLevel: 'info'
    }}>
      <ConnectionStatus position="top" />
      {/* あなたのアプリコンポーネント */}
      <YourAppContent />
    </AIScreenshotProvider>
  );
}
```

### 3. ローカルサーバーの起動

```bash
# デフォルト設定で起動
rn-ai-screenshot-server start

# カスタムオプション付きで起動
rn-ai-screenshot-server start --port 8080 --host localhost --qr
```

### 4. AIアシスタントの設定

AIアシスタントにこのMCPサーバー設定を追加：

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

## 🤖 利用可能なMCPツール

設定が完了すると、AIアシスタントは以下のツールにアクセスできます：

- **`get_current_screenshot`** - オプション付きでアプリのスクリーンショットをキャプチャ
- **`get_app_context`** - 現在のルート、コンポーネントツリー、ユーザーインタラクションを取得
- **`send_command`** - アプリにカスタムコマンドを送信
- **`list_connected_devices`** - 接続されているすべてのReact Nativeデバイスをリスト
- **`get_server_status`** - サーバー統計とヘルス情報を取得

## 📱 使用例

### 基本的なスクリーンショット

```tsx
import { useAIScreenshot } from '@rn-ai-screenshot/client';

function MyComponent() {
  const { takeScreenshot, isConnected } = useAIScreenshot();
  
  const handleScreenshot = async () => {
    if (isConnected) {
      const screenshot = await takeScreenshot({ quality: 0.8 });
      console.log('スクリーンショットキャプチャ:', screenshot.length);
    }
  };
  
  return (
    <Button title="スクリーンショット撮影" onPress={handleScreenshot} />
  );
}
```

### カスタムスクリーンショットビュー

```tsx
import { ScreenshotView } from '@rn-ai-screenshot/client';

function MyScreen() {
  return (
    <ScreenshotView 
      onScreenshot={(data) => console.log('スクリーンショット撮影完了')}
      screenshotOptions={{ quality: 0.9, format: 'png' }}
    >
      <Text>このコンテンツがキャプチャされます</Text>
    </ScreenshotView>
  );
}
```

## ⚙️ 設定

### クライアントSDK設定

```tsx
const config = {
  // サーバー接続
  serverUrl: 'ws://192.168.1.100:8080',  // 明示的なサーバーURL
  autoDiscovery: true,                    // サーバー自動検出 (デフォルト: true)
  discoveryTimeout: 5000,                 // 検出タイムアウト (デフォルト: 5000ms)
  
  // 機能
  enableInProduction: false,              // 本番環境で有効化 (デフォルト: false)
  privacyMode: false,                     // プライバシーモード (デフォルト: false)
  screenshotQuality: 0.8,                 // デフォルト品質 (デフォルト: 0.8)
  
  // デバッグ
  logLevel: 'warn',                       // ログレベル (デフォルト: 'warn')
  showConnectionStatus: true,             // ステータス表示 (デフォルト: 開発時true)
};
```

### サーバー設定

```bash
# コマンドラインオプション
rn-ai-screenshot-server start \
  --port 8080 \
  --host localhost \
  --max-connections 100 \
  --cache-size 50 \
  --cache-ttl 300 \
  --log-level info \
  --qr
```

## 🔧 開発

```bash
# リポジトリをクローン
git clone https://github.com/your-org/react-native-ai-screenshot-sdk.git
cd react-native-ai-screenshot-sdk

# 依存関係をインストール
npm install

# すべてのパッケージをビルド
npm run build

# テストを実行
npm run test

# 開発モードを開始（クライアントとサーバー両方）
npm run dev
```

## 🧪 テスト

```bash
# すべてのテストを実行
npm run test

# クライアントテストのみ実行
cd packages/client && npm test

# サーバーテストのみ実行
cd packages/server && npm test

# カバレッジ付きで実行
npm run test -- --coverage
```

## 🐛 トラブルシューティング

### よくある問題

1. **サーバーが見つからない**
   - サーバーが実行中か確認: `rn-ai-screenshot-server status`
   - ファイアウォール設定を確認
   - 自動検出の代わりに明示的なサーバーURLを試す

2. **権限が拒否された（Android）**
   - アプリ設定でストレージ権限を許可
   - `WRITE_EXTERNAL_STORAGE`権限が宣言されているか確認

3. **スクリーンショットが動作しない**
   - react-native-view-shotが適切にリンクされているか確認
   - デバイス互換性を確認
   - デバッグログを有効化: `logLevel: 'debug'`

### デバッグコマンド

```bash
# サーバーステータスを確認
rn-ai-screenshot-server status

# 設定例を表示
rn-ai-screenshot-server config --react-native
rn-ai-screenshot-server config --mcp
```

## 📖 APIリファレンス

### クライアントSDK

- [`AIScreenshotProvider`](./packages/client/docs/AIScreenshotProvider.md)
- [`useAIScreenshot`](./packages/client/docs/useAIScreenshot.md)
- [`ScreenshotView`](./packages/client/docs/ScreenshotView.md)
- [`ConnectionStatus`](./packages/client/docs/ConnectionStatus.md)

### サーバーAPI

- [`AIScreenshotServer`](./packages/server/docs/AIScreenshotServer.md)
- [MCPツールリファレンス](./packages/server/docs/mcp-tools.md)
- [WebSocketプロトコル](./packages/server/docs/websocket-protocol.md)

## 🤝 コントリビューション

コントリビューションを歓迎します！詳細は[コントリビューションガイド](./CONTRIBUTING.md)をご覧ください。

### 開発セットアップ

1. リポジトリをフォーク
2. 機能ブランチを作成
3. 変更を加える
4. テストを追加
5. プルリクエストを送信

## 📄 ライセンス

MIT License - 詳細は[LICENSE](./LICENSE)ファイルをご覧ください。

## 🔗 リンク

- [GitHubリポジトリ](https://github.com/your-org/react-native-ai-screenshot-sdk)
- [NPMパッケージ - クライアント](https://www.npmjs.com/package/@rn-ai-screenshot/client)
- [NPMパッケージ - サーバー](https://www.npmjs.com/package/@rn-ai-screenshot/server)
- [ドキュメント](https://your-org.github.io/react-native-ai-screenshot-sdk)

---

## 🤖 このプロジェクトについて

このReact Native AI Screenshot SDK全体は、AI支援ソフトウェア開発のデモンストレーションとして**Kiro AIアシスタントによって生成**されました。プロジェクトには以下が含まれます：

- TypeScriptを使用した完全なmonorepoアーキテクチャ
- フル機能のReact Nativeクライアント SDK
- WebSocket + MCPサーバー実装
- 包括的なテストスイート
- CLIツールとドキュメント
- 3,000行以上の本番対応コード

これは、AIがコンセプトから実装まで、複雑で実用的なソフトウェアソリューションの作成をどのように支援できるかを示しています。

---

**Kiro AI**によって❤️を込めて作られました - React NativeとAI開発コミュニティのために