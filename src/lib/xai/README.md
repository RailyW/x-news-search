# xAI 搜索模块

本模块封装 MVP 的唯一外部通路：服务端直接请求 xAI Responses API，并启用 `x_search` 完成一次 X/Twitter 搜索。

## 为什么使用 Responses API

xAI 官方推荐使用 Responses API 承载新能力。相比 legacy Chat Completions，Responses API 原生支持 server-side agentic tools、状态化响应、引用信息、usage 成本字段和更清晰的 typed output。MVP 使用同步请求，先保证“一次搜索成功”；后续如需实时观察工具调用，可升级为 streaming。

## `x_search` 与底层工具名

客户端请求中只配置：

```json
{
  "tools": [{ "type": "x_search" }]
}
```

`x_semantic_search`、`x_keyword_search`、`x_user_search`、`x_thread_fetch` 是 xAI 服务端内部的 X Search function names，用于工具调用追踪和计费分析，不是本项目直接传入的工具名。MVP 通过 Responses API 返回的 `output[].type === "x_search_call"` 判断顶层 X Search 是否真的执行。

## 请求字段

`client.ts` 默认构造以下关键字段：

- `model`: 默认 `grok-4.3`，可用 `XAI_MODEL` 覆盖。
- `store: false`: 本地测试不让 xAI 默认保存响应。
- `tool_choice: "required"`: 强制模型至少调用一个工具。
- `max_turns: 3`: 控制一次 agentic 搜索的成本和耗时。
- `reasoning.effort: "low"`: 保持稳定工具调用，同时避免 MVP 成本过高。
- `tools: [{ type: "x_search" }]`: 只启用 X Search。

## 环境变量

服务端请求只从服务端环境读取敏感配置，浏览器组件不能接触 API key。

- `XAI_API_KEY`: 必填，xAI API key。
- `XAI_BASE_URL`: 可选，xAI API 根地址，默认 `https://api.x.ai/v1`。如果使用代理或兼容网关，可改为对应根地址；如果传入地址已经以 `/responses` 结尾，客户端不会重复拼接。
- `XAI_MODEL`: 可选，默认 `grok-4.3`。
- `XAI_TIMEOUT_MS`: 可选，默认 `90000`，小于 1000 或非法值会回退到默认值。

## 响应解析

`parser.ts` 只输出前端稳定字段：

- 从 `message` / `output_text` 拼接 `report`。
- 从 `x_search_call` 收集工具调用证据。
- 从顶层 `citations` 和 `output_text.annotations` 收集 URL。
- 从 `usage` 读取 token、server-side tool 数量和 `cost_in_usd_ticks`。
- 没有 `x_search_call` 时返回 `x_search_not_called`，避免普通模型回答被误判为搜索成功。

## 错误码

- `invalid_query`: 查询为空或不合法。
- `missing_api_key`: 服务端没有 `XAI_API_KEY`。
- `xai_http_error`: xAI 返回非 2xx 或网络错误。
- `xai_timeout`: 请求超过 `XAI_TIMEOUT_MS`。
- `xai_invalid_response`: xAI 响应结构或 JSON 不符合预期。
- `x_search_not_called`: 没有发现 `x_search_call`。
- `no_report_text`: 搜索执行了，但没有最终文本。

## 调试

1. 复制 `.env.example` 为 `.env.local` 并填写 `XAI_API_KEY`。
2. 运行 `pnpm dev`。
3. 在页面提交搜索后展开“原始响应”查看完整 Responses API 返回体。
4. 如果页面提示 `x_search_not_called`，优先检查请求体是否仍包含 `tools: [{ "type": "x_search" }]` 和 `tool_choice: "required"`。

API key 只能在服务端读取，不能传给浏览器组件或写入客户端状态。
