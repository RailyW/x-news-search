# Repository Guidelines

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
