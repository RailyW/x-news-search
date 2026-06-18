# xAI 搜索模块

本模块封装服务端到 xAI 的外部通路：默认请求 xAI Responses API，并启用 `x_search` 完成一次 X/Twitter 搜索；也可以通过环境变量切换到 legacy Chat Completions API。

## 为什么默认使用 Responses API

xAI 官方推荐使用 Responses API 承载新能力。相比 legacy Chat Completions，Responses API 原生支持 server-side agentic tools、状态化响应、引用信息、usage 成本字段和更清晰的 typed output。MVP 使用同步请求，先保证“一次搜索成功”；后续如需实时观察工具调用，可升级为 streaming。

Chat Completions 仍作为兼容模式保留，适合接入只支持 `/v1/chat/completions` 的代理或旧网关。Chat 模式使用 `messages` 请求体和 legacy `search_parameters` 请求 X 数据源，但响应里通常没有 Responses 的 `x_search_call` 输出项，因此解析器只要求最终文本存在，并尽量读取顶层 `citations` / `sources`。

## `x_search` 与底层工具名

Responses 模式的客户端请求中只配置：

```json
{
  "tools": [{ "type": "x_search" }]
}
```

`x_semantic_search`、`x_keyword_search`、`x_user_search`、`x_thread_fetch` 是 xAI 服务端内部的 X Search function names，用于工具调用追踪和计费分析，不是本项目直接传入的工具名。Responses 模式通过返回的 `output[].type === "x_search_call"` 判断顶层 X Search 是否真的执行。

## 请求字段

Responses 模式构造以下关键字段：

- `model`: 默认 `grok-4.3`，可用 `XAI_MODEL` 覆盖。
- `store: false`: 本地测试不让 xAI 默认保存响应。
- `tool_choice: "required"`: 强制模型至少调用一个工具。
- `max_turns: 3`: 控制一次 agentic 搜索的成本和耗时。
- `reasoning.effort: "low"`: 保持稳定工具调用，同时避免 MVP 成本过高。
- `tools: [{ type: "x_search" }]`: 只启用 X Search。

Chat Completions 模式构造以下关键字段：

- `model`: 默认 `grok-4.3`，可用 `XAI_MODEL` 覆盖。
- `stream: false`: 当前 API 路由只处理同步 JSON。
- `messages`: 复用同一组中文 system/user 搜索提示。
- `search_parameters.mode: "on"`: 请求 legacy live search。
- `search_parameters.return_citations: true`: 要求返回引用信息。
- `search_parameters.sources: [{ type: "x" }]`: 限定搜索来源为 X。

Chat Completions 模式不显式发送 `reasoning_effort` 或 `reasoning`。xAI 对 reasoning 模型未指定时默认使用低推理强度；省略该字段可以避免部分代理或兼容层同时注入 `reasoning.effort` 后触发参数冲突。

## Radar 结构化调用

`radar.ts` 是 MVP 2.0 的推荐/画像专用 xAI 客户端，和 `client.ts` 的单次报告搜索并行存在：

- `createXaiRadarClient().search(...)`: 使用当前 stable/working profile、高可信源和搜索主题构造搜索提示，启用 X Search，并要求模型返回结构化 JSON。输出不是完整报告，而是 URL-first 的 feed items、summary、tag、评分、命中原因，以及少量可选 pending profile insights。
- `createXaiRadarClient().analyzeFeedback(...)`: 不启用 X Search，只让模型解释用户对单条 feed item 的 like/dislike/save/hide，返回 working profile patch 和可选 pending insight。

Responses 模式使用 `text.format.type = "json_schema"`；Chat Completions 模式使用 `response_format.type = "json_schema"`。这与 xAI 官方结构化输出文档保持一致，并且 xAI 文档说明结构化输出可以和服务端工具调用一起使用：[Structured Outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)。X Search 工具名和 `allowed_x_handles` 等参数来自 xAI 官方 X Search 文档：[X Search](https://docs.x.ai/developers/tools/x-search)。

Radar 的 Chat Completions 模式仍不发送 `reasoning` 或 `reasoning_effort`，并使用 legacy `search_parameters` 请求 X 来源，避免再次触发 reasoning 参数冲突。

## 环境变量

服务端请求只从服务端环境读取敏感配置，浏览器组件不能接触 API key。

- `XAI_API_KEY`: 必填，xAI API key。
- `XAI_BASE_URL`: 可选，xAI API 根地址，默认 `https://api.x.ai/v1`。如果使用代理或兼容网关，可改为对应根地址；如果传入地址已经以 `/responses` 或 `/chat/completions` 结尾，客户端会按当前 `XAI_API_ENDPOINT` 归一到目标路径。
- `XAI_API_ENDPOINT`: 可选，默认 `responses`。支持 `responses`、`chat_completions`，也兼容 `chat`、`chat-completions`、`chat/completions` 写法。
- `XAI_MODEL`: 可选，默认 `grok-4.3`。
- `XAI_TIMEOUT_MS`: 可选，默认 `90000`，小于 1000 或非法值会回退到默认值。

## 响应解析

`parser.ts` 只输出前端稳定字段：

- Responses 模式从 `message` / `output_text` 拼接 `report`。
- Responses 模式从 `x_search_call` 收集工具调用证据；没有 `x_search_call` 时返回 `x_search_not_called`，避免普通模型回答被误判为搜索成功。
- Chat Completions 模式从 `choices[].message.content` 拼接 `report`，并兼容可能出现的 `choices[].message.tool_calls`。
- 从顶层 `citations`、顶层 `sources` 和 `output_text.annotations` 收集 URL。
- 从 `usage` 读取 token、server-side tool 数量和 `cost_in_usd_ticks`，同时兼容 `input_tokens/output_tokens` 与 `prompt_tokens/completion_tokens`。

`radar.ts` 解析结构化 JSON 后会再次做本地清理：丢弃缺少 URL/summary 的条目，限制评分到 0-1，清洗 profile patch，并把异常 `sourceType` 归为 `unknown`。

模型偶尔会返回比 JSON schema 更短的字段，例如 `score` 和 `hitReason`，而不是 `relevanceScore`、`importanceScore`、`trustScore` 和 `reason`。Radar 客户端会把这些简写字段归一化：`score` 会作为相关度和重要性的 fallback，高可信源命中时会用配置权重填充可信度，`hitReason` 会作为命中原因展示，并会从 `x.com/{handle}/...` URL 中推断作者和高可信来源。

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
3. 如需 Chat Completions 兼容模式，把 `.env.local` 中的 `XAI_API_ENDPOINT` 改为 `chat_completions` 并重启开发服务。
4. 在页面提交搜索后展开“原始响应”查看完整 xAI 返回体。
5. 如果 Responses 模式提示 `x_search_not_called`，优先检查请求体是否仍包含 `tools: [{ "type": "x_search" }]` 和 `tool_choice: "required"`。

API key 只能在服务端读取，不能传给浏览器组件或写入客户端状态。
