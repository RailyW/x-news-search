import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRadarService } from "@/lib/radar/service";
import type { RadarAiClient } from "@/lib/radar/types";

const tempDirs: string[] = [];

// isBusyError 判断 Windows 下 SQLite 临时文件是否仍被当前测试进程短暂占用。
function isBusyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EBUSY";
}

// cleanupTempDirs 处理 Windows 下 libSQL 关闭后文件锁短暂滞留的问题。
async function cleanupTempDirs() {
  const dirs = tempDirs.splice(0);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const remaining: string[] = [];

    for (const dir of dirs) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (error) {
        if (isBusyError(error)) {
          continue;
        }

        if (attempt === 4) {
          throw error;
        }

        remaining.push(dir);
      }
    }

    if (remaining.length === 0) {
      return;
    }

    dirs.splice(0, dirs.length, ...remaining);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// createFixturePaths 为服务层测试创建隔离的配置文件和 SQLite 文件。
async function createFixturePaths() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "x-news-radar-service-"));
  tempDirs.push(dir);
  const configPath = path.join(dir, "radar-profile.json");
  const databaseUrl = `file:${path.join(dir, "radar.sqlite").replace(/\\/g, "/")}`;

  await writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      language: "zh-CN",
      stableProfile: {
        interests: [{ label: "AI Agent", weight: 0.8 }],
        dislikes: [],
        preferredSignals: [{ label: "官方发布", weight: 1 }],
        notes: [],
      },
      workingProfile: {
        interests: [],
        dislikes: [],
        preferredSignals: [],
        notes: [],
      },
      trustedSources: [{ handle: "openai", label: "OpenAI", weight: 1, enabled: true }],
      searchTopics: [{ id: "agents", label: "AI Agents", query: "AI coding agents", enabled: true }],
    }),
    "utf8",
  );

  return { configPath, databaseUrl };
}

describe("radar service", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDirs();
  });

  it("能完成手动搜索、保存条目，并把 like 转成待确认画像更新", async () => {
    const paths = await createFixturePaths();
    const aiClient: RadarAiClient = {
      search: vi.fn().mockResolvedValue({
        items: [
          {
            url: "https://x.com/openai/status/1",
            title: "OpenAI Agent 更新",
            authorHandle: "openai",
            publishedAt: "2026-06-18T00:00:00Z",
            summary: "OpenAI 讨论了 Agent 工具链的新能力。",
            rawText: "OpenAI 讨论 Agent 工具链。",
            tags: ["AI Agent", "开发工具"],
            relevanceScore: 0.95,
            importanceScore: 0.8,
            trustScore: 1,
            reason: "高可信源发布，且命中 AI Agent 兴趣。",
            sourceType: "trusted_source",
            rawResponse: { fixture: "search" },
          },
        ],
        profileInsights: [],
        rawResponse: { fixture: "raw" },
        elapsedMs: 12,
      }),
      analyzeFeedback: vi.fn().mockResolvedValue({
        shouldCreateInsight: true,
        workingProfilePatch: {
          interests: [{ label: "开发者 Agent 工具链", weight: 0.75 }],
          notes: ["用户 like 了 OpenAI Agent 工具链相关条目。"],
        },
        insight: {
          title: "上调开发者 Agent 工具链兴趣",
          rationale: "用户对高可信源的 Agent 工具链内容给出 like。",
          confidence: 0.84,
          proposedPatch: {
            interests: [{ label: "开发者 Agent 工具链", weight: 0.75 }],
          },
        },
        rawResponse: { fixture: "feedback" },
      }),
    };
    const service = createRadarService({ ...paths, aiClient });

    const runResult = await service.runManualRadarSearch();
    expect(runResult.ok).toBe(true);

    const stateAfterRun = await service.getRadarState();
    expect(stateAfterRun.items[0]?.summary).toContain("Agent 工具链");

    const feedbackResult = await service.recordItemFeedback({
      itemId: stateAfterRun.items[0]!.id,
      value: "like",
      note: "正中口味",
    });

    expect(feedbackResult.ok).toBe(true);
    const stateAfterFeedback = await service.getRadarState();
    expect(stateAfterFeedback.pendingInsights).toHaveLength(1);
    expect(stateAfterFeedback.profile.workingProfile.interests[0]?.label).toBe("开发者 Agent 工具链");

    const insight = stateAfterFeedback.pendingInsights[0]!;
    await service.decideInsight({ insightId: insight.id, action: "accept" });

    const stateAfterAccept = await service.getRadarState();
    expect(stateAfterAccept.pendingInsights).toHaveLength(0);
    expect(stateAfterAccept.profile.stableProfile.interests.map((item) => item.label)).toContain(
      "开发者 Agent 工具链",
    );
  });
});
