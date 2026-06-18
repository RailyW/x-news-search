# Radar 服务模块

本模块实现 MVP 2.0 的核心推荐闭环：从配置种子加载用户画像和高可信源，使用 Drizzle + SQLite 保存运行状态，调用 xAI Radar 客户端取得结构化 X 信息条目，并用 like/dislike/save/hide 反馈驱动 working profile 与待确认 stable profile 更新。

## 文件说明

- `types.ts`: Radar 领域类型契约，覆盖画像、搜索计划、feed 条目、反馈、待确认 insight、运行记录和 AI 客户端接口。前端、API route、服务层和测试都复用这些类型。
- `profile.ts`: 画像配置加载和归一化逻辑。负责限制权重到 0-1、清理 X handle、合并同名信号、应用 LLM 画像补丁，并区分 `stableProfile` 与 `workingProfile`。
- `schema.ts`: Drizzle SQLite 表定义。当前表包括 `radar_profile_states`、`radar_runs`、`radar_items`、`radar_feedback` 和 `radar_insights`。
- `db.ts`: 本地 SQLite 连接与表结构初始化。实现使用 `@libsql/client` 的 `file:` URL，本地默认路径为 `data/radar.sqlite`，查询与写入通过 Drizzle 执行。
- `repository.ts`: 类型化持久化仓储。负责初始化画像、创建运行记录、URL 去重写入条目、保存反馈、创建/处理 pending insight 和聚合首页状态。
- `service.ts`: 应用服务编排层。负责构造搜索计划、调用注入的 `RadarAiClient`、处理失败运行、保存条目、解释反馈、更新 working profile，以及将用户确认的 insight 合并进 stable profile。

## 数据流

1. `loadRadarProfileConfig` 读取 `RADAR_PROFILE_CONFIG_PATH`，默认使用 `config/radar-profile.example.json`。
2. `createRadarRepository` 打开 `RADAR_DATABASE_URL` 指向的 SQLite 文件，并确保表结构存在。
3. `initializeProfile` 只在数据库没有画像时写入配置种子，后续不会覆盖已经学习出的画像。
4. `runManualRadarSearch` 从当前画像生成 `RadarQueryPlan`，调用 `src/lib/xai/radar.ts` 的结构化 X Search，按 URL upsert feed 条目。
5. `recordItemFeedback` 先保存用户反馈，再让 LLM 判断是否更新 working profile 或创建 pending insight。
6. `decideInsight` 在用户接受时把 `proposedPatch` 合并进 stable profile；拒绝时只更新 insight 状态。

读取 feed 状态时，仓储会对早期已经落库但字段不完整的条目做展示回填：如果数据库中的评分仍为 0，且 `rawResponse` 中存在 `score`，则用它填充相关度和重要性；如果 URL handle 命中当前高可信源，则用该来源权重填充可信度并把来源类型显示为 `trusted_source`；如果原始响应存在 `hitReason`，则替换默认的“模型未提供命中原因。”。

## 画像层次

- `stableProfile`: 长期画像。只有用户在待确认视图接受 insight 后才更新，适合保存真正稳定的兴趣、偏好信号和避雷信号。
- `workingProfile`: 短期画像。like/dislike 后可由 LLM 自动更新，适合捕捉近期口味变化，不要求每次反馈都产生稳定画像变更。
- `trustedSources`: 手动配置的高可信 X 账号。MVP 中用于提示模型优先考虑这些来源，并在条目评分中体现可信度。
- `searchTopics`: 手动搜索主题。`cadence` 和 `lookbackDays` 会被保存，当前版本只支持手动触发，后续定时任务可以直接复用这些字段。

## SQLite 表职责

- `radar_profile_states`: 当前画像单行状态。
- `radar_runs`: 每次手动搜索的运行记录、查询计划和错误信息。
- `radar_items`: URL 去重后的信息条目，包含 summary、rawText、tag、评分、来源类型和反馈状态。
- `radar_feedback`: 用户显式反馈日志。
- `radar_insights`: LLM 提出的待确认画像建议。

## 测试

相关测试位于 `tests/radar-*.test.ts`：

- `radar-profile.test.ts`: 配置加载、权重归一化和画像补丁合并。
- `radar-repository.test.ts`: SQLite/Drizzle 仓储初始化、条目写入和反馈保存。
- `radar-service.test.ts`: 注入假 AI 客户端后验证手动搜索、反馈学习和 insight 接受流程。
- `radar-xai.test.ts`: 不联网验证 xAI Radar 请求体和结构化响应解析。

运行方式：

```bash
pnpm vitest run tests/radar-profile.test.ts tests/radar-repository.test.ts tests/radar-service.test.ts tests/radar-xai.test.ts
```
