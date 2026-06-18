# 前端组件模块

本模块存放应用页面直接复用的 React 组件，以及由 shadcn/ui 风格约定生成的基础 UI 组件。

## 文件说明

- `search-console.tsx`: 搜索台主交互组件，负责管理搜索输入、加载状态、成功结果、错误提示、引用链接、调用成本和原始响应展示。组件只调用本项目的 `/api/search` 服务端路由，不读取或保存 `XAI_API_KEY`、`XAI_BASE_URL`、`XAI_API_ENDPOINT` 等服务端环境变量。
- `ui/button.tsx`: 基础按钮组件，提供统一按钮样式和 variant/size 组合。
- `ui/card.tsx`: 基础卡片组件，提供页面主要搜索面板的结构化容器。
- `ui/input.tsx`: 基础输入框组件，提供搜索主题输入控件。
- `ui/badge.tsx`: 基础徽章组件，展示搜索状态和错误码。

## 搜索台行为

`SearchConsole` 会把用户输入修剪后以 JSON 请求发送到 `/api/search`。服务端路由根据 xAI 模块配置决定使用 Responses API 还是 Chat Completions API，前端只消费统一的 `SearchApiResponse` 结构。

组件展示层不区分底层 xAI endpoint，原因是两种 endpoint 已在服务端解析为相同字段：

- `report`: 中文搜索报告。
- `citations`: 结构化引用链接。
- `toolCalls`: Responses 或 Chat Completions 返回的工具调用记录。
- `usage`: token、工具次数和成本信息。
- `rawResponse`: 调试用原始响应。

## 安全边界

浏览器组件不能接触 API key 或代理地址等敏感配置。任何 xAI 请求都必须经过服务端路由执行，避免密钥进入浏览器状态、网络面板或客户端 bundle。
