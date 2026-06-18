# Repository Guidelines

## 命令要求

用户已授权在本仓库内按任务需要自动执行 git 指令，包括但不限于 `git add`、`git commit`、`git push`、`git switch`、`git checkout` 等，无需每次额外请求手动确认。

当一个任务完成并通过必要验证后，应当自动将本次任务相关变更提交，并推送到当前分支对应的远程分支；提交范围必须限于本次任务产生或明确需要纳入的文件。

用户对于自身的仓库的 git 树有绝对的所有权。执行 git 操作前应当检查工作区状态，避免覆盖、回滚、删除或提交与当前任务无关的用户改动；确需执行可能丢弃已有改动的破坏性操作时，必须先取得用户明确授权。

用户对自己所处的分支有绝对的选择权，在 main 分支上做修改是被允许的。

## Project Structure & Module Organization

This repository is currently empty, so new contributors should establish a small, predictable layout as code is added. Place application source in `src/`, automated tests in `tests/`, reusable static files in `assets/`, and project documentation in `docs/`. Keep configuration files such as `.env.example`, lint configs, and build configs at the repository root. If the project grows into multiple packages, use clear paths such as `packages/api/` and `packages/web/`.

## Build, Test, and Development Commands

No build system or package manifest exists yet. When a runtime is introduced, document the canonical commands here and keep them in the project manifest:

- `npm install` installs JavaScript dependencies when a `package.json` is added.
- `npm run dev` starts the local development server.
- `npm test` runs the automated test suite.
- `npm run build` creates a production-ready bundle or output artifact.

Do not add ad hoc scripts without documenting their purpose.

## Coding Style & Naming Conventions

Prefer clear, descriptive names over abbreviations. Use `camelCase` for JavaScript or TypeScript variables and functions, `PascalCase` for classes and UI components, and `kebab-case` for file names such as `news-search-client.ts`. Use two-space indentation for JavaScript, TypeScript, JSON, YAML, and Markdown. Add Prettier and ESLint before style drift appears.

## Testing Guidelines

Add tests alongside the first implementation. Put unit tests under `tests/` or near source files using a consistent pattern such as `*.test.ts`. Cover parsing, search ranking, external API handling, and error states. Every bug fix should include a regression test when practical. Avoid live third-party services unless tests are marked as integration tests.

## Commit & Pull Request Guidelines

There is no local git history in this directory, so no existing commit convention can be inferred. Use concise, imperative commit messages such as `Add search API client` or `Fix query timeout handling`. Pull requests should include a summary, validation steps, linked issues when applicable, and screenshots or logs for user-facing changes.

## Security & Configuration Tips

Never commit secrets, API keys, access tokens, or private datasets. Store required environment variables in `.env.example` with safe placeholder values, and document how each value is used. Validate all external inputs before using them in search queries, API calls, or paths.
