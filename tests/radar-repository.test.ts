import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRadarRepository } from "@/lib/radar/repository";
import type { RadarProfileDocument } from "@/lib/radar/types";

const tempDirs: string[] = [];

// isBusyError 判断 Windows 下 SQLite 临时文件是否仍被当前测试进程短暂占用。
function isBusyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EBUSY";
}

// cleanupTempDirs 在 Windows 上容忍 libSQL 文件锁释放滞后；残留文件位于系统临时目录。
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

// createDatabaseUrl 为每个仓储测试创建独立 SQLite 文件，保证数据不串扰。
async function createDatabaseUrl() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "x-news-radar-db-"));
  tempDirs.push(dir);
  return `file:${path.join(dir, "radar.sqlite").replace(/\\/g, "/")}`;
}

const profile: RadarProfileDocument = {
  version: 1,
  language: "zh-CN",
  stableProfile: {
    interests: [{ label: "AI Agent", weight: 0.8 }],
    dislikes: [],
    preferredSignals: [],
    notes: [],
  },
  workingProfile: {
    interests: [],
    dislikes: [],
    preferredSignals: [],
    notes: [],
  },
  trustedSources: [{ handle: "openai", label: "OpenAI", weight: 1, enabled: true, notes: "" }],
  searchTopics: [
    {
      id: "agents",
      label: "AI Agents",
      query: "AI coding agents",
      enabled: true,
      cadence: "manual",
      lookbackDays: 7,
    },
  ],
};

describe("radar repository", () => {
  afterEach(async () => {
    await cleanupTempDirs();
  });

  it("能初始化画像、写入条目并记录反馈", async () => {
    const repository = await createRadarRepository({ databaseUrl: await createDatabaseUrl() });

    try {
      await repository.initializeProfile(profile);
      const run = await repository.createRun({
        queryPlan: {
          generatedAt: "2026-06-18T00:00:00.000Z",
          topics: profile.searchTopics,
          trustedSources: [],
        },
      });
      const items = await repository.upsertItems(run.id, [
        {
          url: "https://x.com/openai/status/1",
          title: "OpenAI 发布新工具",
          authorHandle: "openai",
          publishedAt: "2026-06-18T00:00:00Z",
          summary: "OpenAI 发布了面向开发者的新工具。",
          rawText: "完整原文摘要",
          tags: ["AI Agent"],
          relevanceScore: 0.9,
          importanceScore: 0.8,
          trustScore: 1,
          reason: "命中高可信源和画像兴趣。",
          sourceType: "trusted_source",
          rawResponse: { fixture: true },
        },
      ]);

      await repository.addFeedback({ itemId: items[0]!.id, value: "like", note: "相关" });

      const state = await repository.getState();

      expect(state.profile.stableProfile.interests[0]?.label).toBe("AI Agent");
      expect(state.items).toHaveLength(1);
      expect(state.items[0]).toMatchObject({ feedback: "like", summary: "OpenAI 发布了面向开发者的新工具。" });
    } finally {
      await repository.close();
    }
  });
});
