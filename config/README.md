# Radar 配置模块

本目录保存 Radar Feed MVP 2.0 的可复制配置模板，当前只包含画像和高可信源种子文件。

## 文件说明

- `radar-profile.example.json`: 示例用户画像配置。应用首次启动时会读取它，并把 stable profile、working profile、高可信源和搜索主题写入 SQLite。后续 like/dislike 产生的学习结果保存在数据库中，不会反写这个示例文件。

## 本地配置

如果要维护自己的画像和高可信源，可以复制一份本地文件，例如 `config/radar-profile.local.json`，然后在 `.env.local` 中设置：

```bash
RADAR_PROFILE_CONFIG_PATH=config/radar-profile.local.json
```

`config/*.local.json` 已在 `.gitignore` 中忽略，适合保存个人偏好、关注来源和实验主题。

## 字段约定

- `stableProfile`: 稳定画像，只在用户接受待确认 insight 后更新，是长期推荐偏好的核心来源。
- `workingProfile`: 短期画像，like/dislike 后可由模型自动更新，用于快速捕捉近期兴趣变化。
- `trustedSources`: 手动配置的高可信 X 账号。`handle` 可带或不带 `@`，加载时会统一归一化。
- `searchTopics`: 手动触发搜索时使用的主题。`cadence` 在 MVP 中只保存配置，不启动定时任务；后续接调度器时可以直接复用。
- `weight`: 统一使用 0 到 1，加载时会自动截断异常值。
