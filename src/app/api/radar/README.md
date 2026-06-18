# Radar API 路由模块

本目录提供 Radar Feed MVP 2.0 的服务端 API。所有路由都运行在 `nodejs` runtime，浏览器不会直接接触 `XAI_API_KEY`、`RADAR_DATABASE_URL` 或画像配置文件。

## 文件说明

- `state/route.ts`: `GET /api/radar/state`，读取当前 SQLite 中的画像、feed 条目、待确认画像建议和最近运行记录。该端点不触发 xAI 请求。
- `run/route.ts`: `POST /api/radar/run`，手动触发一次 Grok X Search，并把结构化条目写入 SQLite。MVP 不创建后台定时任务，后续调度器可以复用同一服务方法。
- `feedback/route.ts`: `POST /api/radar/feedback`，保存用户对条目的 `like`、`dislike`、`save` 或 `hide`，并尝试调用 LLM 分析是否需要更新 working profile 或创建 pending insight。
- `insights/route.ts`: `POST /api/radar/insights`，接受或拒绝待确认画像建议。接受后会把建议补丁合并进 stable profile。

## 响应约定

所有成功响应都包含 `ok: true`。失败响应包含 `ok: false`、`code`、`message` 和可选 `detail`，前端只需要按 `ok` 分支处理。

## 安全边界

这些路由只接受结构化 JSON 输入，所有实际外部请求都在 `src/lib/xai/radar.ts` 中执行。前端提交反馈时只传条目 ID、反馈值和可选备注，不传用户画像全文。
