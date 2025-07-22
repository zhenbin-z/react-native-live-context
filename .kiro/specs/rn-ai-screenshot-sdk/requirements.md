# Requirements Document

## Introduction

本项目旨在开发一个开源的React Native AI截图SDK，让AI编程助手（如Claude、Kiro等）能够通过MCP（Model Context Protocol）实时获取正在开发的React Native应用的截图，从而更好地理解当前UI状态并提供精准的代码修改建议。

该SDK采用客户端-服务端架构：
- 客户端：集成到React Native项目中的SDK，负责截图和上下文收集
- 服务端：本地运行的WebSocket + MCP服务器，作为AI与移动应用的桥梁

## Requirements

### Requirement 1

**User Story:** 作为React Native开发者，我希望能够轻松地将SDK集成到我的项目中，以便AI助手能够看到我的应用界面

#### Acceptance Criteria

1. WHEN 开发者安装SDK包 THEN 系统 SHALL 提供简单的npm/yarn安装命令
2. WHEN 开发者添加Context Provider THEN 系统 SHALL 自动初始化截图功能
3. WHEN SDK初始化完成 THEN 系统 SHALL 自动连接到本地服务端
4. IF 服务端未运行 THEN 系统 SHALL 提供清晰的错误提示和启动指导

### Requirement 2

**User Story:** 作为开发者，我希望SDK能够安全地截取应用画面，并且不影响应用的正常运行

#### Acceptance Criteria

1. WHEN 应用在真机或模拟器上运行 THEN 系统 SHALL 能够截取当前屏幕画面
2. WHEN 截图功能启用 THEN 系统 SHALL 不影响应用的性能和用户体验
3. WHEN 截图包含敏感信息 THEN 系统 SHALL 提供隐私保护选项
4. WHEN 应用切换到后台 THEN 系统 SHALL 暂停截图功能
5. IF 截图权限被拒绝 THEN 系统 SHALL 提供权限申请指导

### Requirement 3

**User Story:** 作为开发者，我希望客户端能够通过WebSocket与本地服务端实时通信

#### Acceptance Criteria

1. WHEN 客户端启动 THEN 系统 SHALL 自动连接到指定的WebSocket服务器
2. WHEN 服务端请求截图 THEN 客户端 SHALL 立即响应并发送截图数据
3. WHEN 网络连接中断 THEN 系统 SHALL 自动重连并恢复通信
4. WHEN 接收到无效命令 THEN 系统 SHALL 记录错误并继续运行
5. IF WebSocket连接失败 THEN 系统 SHALL 提供详细的错误信息

### Requirement 4

**User Story:** 作为开发者，我希望本地服务端能够作为MCP服务器为AI提供截图工具

#### Acceptance Criteria

1. WHEN 服务端启动 THEN 系统 SHALL 同时启动WebSocket服务器和MCP服务器
2. WHEN AI请求截图工具 THEN MCP服务器 SHALL 提供get_screenshot函数
3. WHEN AI调用get_screenshot THEN 系统 SHALL 通过WebSocket请求客户端截图
4. WHEN 收到截图数据 THEN 系统 SHALL 将图片返回给AI
5. IF 客户端未连接 THEN 系统 SHALL 返回适当的错误信息

### Requirement 5

**User Story:** 作为开发者，我希望SDK能够收集应用的上下文信息，帮助AI更好地理解当前状态

#### Acceptance Criteria

1. WHEN Context Provider被使用 THEN 系统 SHALL 收集当前路由信息
2. WHEN 组件状态发生变化 THEN 系统 SHALL 更新上下文数据
3. WHEN AI请求上下文 THEN 系统 SHALL 提供当前页面的组件树信息
4. WHEN 用户交互发生 THEN 系统 SHALL 记录相关的交互事件
5. IF 上下文数据过大 THEN 系统 SHALL 进行适当的数据压缩

### Requirement 6

**User Story:** 作为开发者，我希望能够配置SDK的行为，以适应不同的开发需求

#### Acceptance Criteria

1. WHEN 开发者提供配置选项 THEN 系统 SHALL 支持自定义服务端地址和端口
2. WHEN 需要调试 THEN 系统 SHALL 提供详细的日志输出选项
3. WHEN 在生产环境 THEN 系统 SHALL 自动禁用截图功能
4. WHEN 配置无效 THEN 系统 SHALL 使用默认配置并给出警告
5. IF 配置文件存在 THEN 系统 SHALL 优先使用文件配置

### Requirement 7

**User Story:** 作为AI编程助手，我希望能够通过MCP工具获取应用截图和相关信息

#### Acceptance Criteria

1. WHEN AI需要查看当前界面 THEN MCP工具 SHALL 提供get_current_screenshot函数
2. WHEN AI需要了解应用状态 THEN MCP工具 SHALL 提供get_app_context函数
3. WHEN AI需要触发特定操作 THEN MCP工具 SHALL 提供send_command函数
4. WHEN 截图获取成功 THEN 系统 SHALL 返回base64编码的图片数据
5. IF 操作失败 THEN 系统 SHALL 返回详细的错误信息和建议

### Requirement 8

**User Story:** 作为开源项目维护者，我希望项目具有良好的文档和示例，方便社区贡献

#### Acceptance Criteria

1. WHEN 开发者查看项目 THEN 系统 SHALL 提供完整的README文档
2. WHEN 开发者需要集成 THEN 系统 SHALL 提供详细的集成指南
3. WHEN 开发者遇到问题 THEN 系统 SHALL 提供常见问题解答
4. WHEN 开发者想要贡献 THEN 系统 SHALL 提供贡献指南和代码规范
5. IF 新功能添加 THEN 系统 SHALL 更新相应的文档和示例代码