# Radar Feed MVP 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manually triggered, LLM-driven X Radar Feed that searches X through Grok/x_search, stores URL-first feed items in SQLite, and learns user preferences through feedback plus pending profile insights.

**Architecture:** Keep the existing xAI search module as the low-level API caller, then add a new `src/lib/radar` module for profile loading, Drizzle schema, SQLite repository, Radar run orchestration, and feedback learning. The UI shifts from a single search console to a Radar dashboard with feed, configuration summary, and pending insight actions.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, SQLite via local `@libsql/client` file databases, Vitest, xAI Responses API with `x_search`.

---

### File Structure

- Create `config/radar-profile.example.json`: seed profile, high-trust source packs, topic watches, and run settings.
- Create `config/README.md`: explains seed profile ownership and private local config expectations.
- Modify `.gitignore`: ignore local `config/*.local.json` and SQLite runtime files.
- Create `src/lib/radar/schema.ts`: Drizzle SQLite table definitions.
- Create `src/lib/radar/db.ts`: SQLite connection and schema initialization.
- Create `src/lib/radar/profile.ts`: seed profile loading and effective profile composition.
- Create `src/lib/radar/repository.ts`: typed persistence helpers for runs, jobs, items, feedback, working profile, and insights.
- Create `src/lib/radar/service.ts`: run orchestration, item upsert, feedback interpretation, and insight resolution.
- Create `src/lib/radar/types.ts`: Radar domain contracts shared by service, API, tests, and UI.
- Create `src/lib/radar/README.md`: module responsibilities and data flow.
- Create `src/lib/xai/radar.ts`: xAI prompts and parsers for Radar item extraction and feedback interpretation.
- Modify `src/lib/xai/README.md`: document Radar-specific structured xAI calls.
- Create `src/app/api/radar/state/route.ts`: fetch dashboard state.
- Create `src/app/api/radar/run/route.ts`: manually trigger Radar run.
- Create `src/app/api/radar/feedback/route.ts`: record item feedback and trigger learning.
- Create `src/app/api/radar/insights/route.ts`: resolve pending insights.
- Create `src/app/api/radar/README.md`: API route contract documentation.
- Create `src/components/radar-dashboard.tsx`: client UI for run button, feed items, config summary, and pending insights.
- Modify `src/components/README.md`: describe the Radar dashboard component.
- Modify `src/app/page.tsx`: render Radar dashboard and update page copy.
- Add tests under `tests/radar-*.test.ts` for profile composition, LLM JSON parsing, repository persistence, and feedback learning.

### Task 1: Dependencies and Runtime Boundaries

- [x] Install `drizzle-orm` and `@libsql/client`.
- [x] Update `.gitignore` for SQLite runtime files and private profile config.
- [x] Add seed config and README files.

### Task 2: Data Contracts and SQLite Layer

- [x] Write failing tests for effective profile composition and SQLite persistence.
- [x] Implement `types.ts`, `schema.ts`, `db.ts`, `profile.ts`, and `repository.ts`.
- [x] Verify repository tests pass with a temporary SQLite database.

### Task 3: xAI Radar Structured Calls

- [x] Write failing tests for parsing JSON Radar items from model text and feedback insight JSON.
- [x] Implement `src/lib/xai/radar.ts` with strict JSON extraction and safe fallback behavior.
- [x] Verify xAI Radar parser tests pass.

### Task 4: Radar Service

- [x] Write failing tests for building search jobs from profile, upserting unique URL items, recording feedback, and creating pending insights from injected feedback analysis.
- [x] Implement `src/lib/radar/service.ts` with dependency injection for xAI calls so tests do not hit the network.
- [x] Verify service tests pass.

### Task 5: API Routes

- [x] Implement state, run, feedback, and insights routes with `runtime = "nodejs"`.
- [ ] Add route-level tests where practical for request validation and stable response shape.

### Task 6: Frontend Dashboard

- [x] Replace the home experience with `RadarDashboard`.
- [x] Keep UI dense and operational: Run Radar button, status line, source/topic summary, URL + summary feed cards, feedback buttons, and pending insights.
- [x] Avoid full report rendering; display model summaries, reasons, tags, scores, and URLs.

### Task 7: Documentation and Verification

- [ ] Update all touched module READMEs.
- [ ] Run targeted tests for radar and existing xAI modules.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Commit and push changes to `origin/main`.

### Self-Review

- Scope matches the agreed MVP: no X API, no scheduler, no full report, manual Run Radar only.
- The plan keeps seed profile in JSON and runtime state in SQLite.
- The plan includes Drizzle ORM, feedback learning, working profile, and Pending Insights.
- No implementation depends on a real network call during unit tests.
