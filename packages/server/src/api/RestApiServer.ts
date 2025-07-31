import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { ServerConfig } from '../types';
import { Logger } from '../utils/Logger';
import { MessageHandler } from '../messaging/MessageHandler';
import { ScreenshotService } from '../services/ScreenshotService';
import { ContextService } from '../services/ContextService';
import { WebSocketServer } from '../websocket/WebSocketServer';

export class RestApiServer {
  private app: Express;
  private config: ServerConfig;
  private logger: Logger;
  private server: any;
  private isRunning = false;

  // Services
  private messageHandler: MessageHandler;
  private screenshotService: ScreenshotService;
  private contextService: ContextService;
  private webSocketServer: WebSocketServer;

  constructor(
    config: ServerConfig,
    messageHandler: MessageHandler,
    screenshotService: ScreenshotService,
    contextService: ContextService,
    webSocketServer: WebSocketServer
  ) {
    this.config = config;
    this.logger = new Logger('info', '[RestApiServer]');
    this.messageHandler = messageHandler;
    this.screenshotService = screenshotService;
    this.contextService = contextService;
    this.webSocketServer = webSocketServer;

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS設定
    this.app.use(cors({
      origin: this.config.security.allowedOrigins,
      credentials: true,
    }));

    // JSON解析
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // リクエストログ
    this.app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined,
      });
      next();
    });
  }

  private setupRoutes(): void {
    // ヘルスチェック
    this.app.get('/health', this.handleHealthCheck.bind(this));

    // サーバー状態
    this.app.get('/api/status', this.handleGetStatus.bind(this));

    // 接続されたデバイス一覧
    this.app.get('/api/devices', this.handleGetDevices.bind(this));

    // スクリーンショット関連
    this.app.post('/api/screenshot', this.handleTakeScreenshot.bind(this));
    this.app.get('/api/screenshot/cache', this.handleGetScreenshotCache.bind(this));
    this.app.delete('/api/screenshot/cache', this.handleClearScreenshotCache.bind(this));

    // コンテキスト関連
    this.app.post('/api/context', this.handleGetContext.bind(this));
    this.app.get('/api/context/cache', this.handleGetContextCache.bind(this));
    this.app.delete('/api/context/cache', this.handleClearContextCache.bind(this));

    // コマンド送信
    this.app.post('/api/command', this.handleSendCommand.bind(this));

    // MCPツール一覧
    this.app.get('/api/mcp/tools', this.handleGetMcpTools.bind(this));

    // エラーハンドリング
    this.app.use(this.handleError.bind(this));
  }

  // ヘルスチェック
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  // サーバー状態取得
  private async handleGetStatus(req: Request, res: Response): Promise<void> {
    try {
      const wsStats = this.webSocketServer.getServerStats();
      const messageStats = this.messageHandler.getStats();
      const screenshotStats = this.screenshotService.getCacheStats();
      const contextStats = this.contextService.getCacheStats();

      res.json({
        websocket: {
          running: wsStats.isRunning,
          clientCount: wsStats.clientCount,
          port: wsStats.port,
          host: wsStats.host,
        },
        messageHandler: {
          processorsCount: messageStats.processorsCount,
          pendingRequests: messageStats.pendingRequestsCount,
          availableClients: messageStats.availableClients,
        },
        cache: {
          screenshots: {
            size: screenshotStats.size,
            maxSize: screenshotStats.maxSize,
            maxAge: screenshotStats.maxAge,
          },
          contexts: {
            size: contextStats.size,
            clients: contextStats.clients,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // 接続デバイス一覧
  private async handleGetDevices(req: Request, res: Response): Promise<void> {
    try {
      const clients = this.webSocketServer.getClients();
      
      res.json({
        devices: clients.map(client => ({
          id: client.id,
          platform: client.metadata.platform,
          version: client.metadata.version,
          userAgent: client.metadata.userAgent,
          lastHeartbeat: client.lastHeartbeat,
          connectedAt: client.lastHeartbeat, // 簡略化
        })),
        totalCount: clients.length,
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // スクリーンショット取得
  private async handleTakeScreenshot(req: Request, res: Response): Promise<void> {
    try {
      const { clientId, quality, format, width, height } = req.body;

      const screenshot = await this.screenshotService.requestScreenshot(clientId, {
        quality,
        format,
        width,
        height,
      });

      res.json({
        success: true,
        screenshot: {
          id: screenshot.id,
          data: screenshot.data,
          timestamp: screenshot.timestamp,
          metadata: screenshot.metadata,
          clientId: screenshot.clientId,
        },
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // スクリーンショットキャッシュ取得
  private async handleGetScreenshotCache(req: Request, res: Response): Promise<void> {
    try {
      const { clientId } = req.query;
      const screenshots = this.screenshotService.getAllScreenshots(clientId as string);
      
      res.json({
        screenshots: screenshots.map(s => ({
          id: s.id,
          clientId: s.clientId,
          timestamp: s.timestamp,
          metadata: s.metadata,
          // データサイズのみ返す（実際のbase64データは重いので）
          dataSize: s.data.length,
        })),
        totalCount: screenshots.length,
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // スクリーンショットキャッシュクリア
  private async handleClearScreenshotCache(req: Request, res: Response): Promise<void> {
    try {
      const { clientId } = req.query;
      const clearedCount = this.screenshotService.clearCache(clientId as string);
      
      res.json({
        success: true,
        clearedCount,
        message: `Cleared ${clearedCount} screenshots from cache`,
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // コンテキスト取得
  private async handleGetContext(req: Request, res: Response): Promise<void> {
    try {
      const { clientId, includeComponentTree, includeInteractions, maxInteractions } = req.body;

      const context = await this.contextService.requestContext(clientId, {
        includeComponentTree,
        includeInteractions,
        maxInteractions,
      });

      res.json({
        success: true,
        context: {
          currentRoute: context.currentRoute,
          routeParams: context.routeParams,
          componentTree: context.componentTree,
          userInteractions: context.userInteractions,
          timestamp: context.timestamp,
        },
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // コンテキストキャッシュ取得
  private async handleGetContextCache(req: Request, res: Response): Promise<void> {
    try {
      const contexts = this.contextService.getAllContexts();
      
      res.json({
        contexts: contexts.map(c => ({
          currentRoute: c.currentRoute,
          routeParams: c.routeParams,
          componentCount: c.componentTree?.length || 0,
          interactionCount: c.userInteractions?.length || 0,
          timestamp: c.timestamp,
        })),
        totalCount: contexts.length,
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // コンテキストキャッシュクリア
  private async handleClearContextCache(req: Request, res: Response): Promise<void> {
    try {
      const { clientId } = req.query;
      const clearedCount = this.contextService.clearCache(clientId as string);
      
      res.json({
        success: true,
        clearedCount,
        message: `Cleared ${clearedCount} contexts from cache`,
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // コマンド送信
  private async handleSendCommand(req: Request, res: Response): Promise<void> {
    try {
      const { command, params, clientId } = req.body;

      if (!command) {
        res.status(400).json({
          success: false,
          error: 'Command is required',
        });
        return;
      }

      const result = await this.messageHandler.sendCommand(command, params, clientId);

      res.json({
        success: true,
        commandResult: {
          command,
          params,
          clientId,
          sentAt: result.timestamp,
          messageId: result.id,
        },
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // MCPツール一覧
  private async handleGetMcpTools(req: Request, res: Response): Promise<void> {
    try {
      // MCPServerから直接取得する方法を後で実装
      res.json({
        tools: [
          'get_current_screenshot',
          'get_app_context',
          'send_command',
          'list_connected_devices',
          'get_server_status',
        ],
        totalCount: 5,
      });
    } catch (error) {
      this.handleError(error, req, res, () => {});
    }
  }

  // エラーハンドリング
  private handleError(error: any, req: Request, res: Response, next: any): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    this.logger.error('REST API error', {
      method: req.method,
      path: req.path,
      error: errorMessage,
    });

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('REST API server is already running');
      return;
    }

    try {
      const port = this.config.websocket.port + 1; // WebSocketポート + 1
      
      this.server = this.app.listen(port, () => {
        this.isRunning = true;
        this.logger.info('REST API server started', {
          port,
          endpoints: [
            'GET /health',
            'GET /api/status',
            'GET /api/devices',
            'POST /api/screenshot',
            'POST /api/context',
            'POST /api/command',
          ],
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start REST API server', { error: errorMessage });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      this.logger.warn('REST API server is not running');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.server.close((error: any) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = false;
      this.logger.info('REST API server stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error stopping REST API server', { error: errorMessage });
      throw error;
    }
  }

  get isActive(): boolean {
    return this.isRunning;
  }

  getPort(): number {
    return this.config.websocket.port + 1;
  }
}