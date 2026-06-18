import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyRadarProfilePatch, loadRadarProfileConfig, mergeWeightedSignals } from "@/lib/radar/profile";

const tempDirs: string[] = [];

// createTempDir 为配置解析测试创建独立目录，避免测试之间共享本地文件。
async function createTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "x-news-radar-profile-"));
  tempDirs.push(dir);
  return dir;
}

describe("radar profile config", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("加载 JSON 配置时会归一化权重、handle 和默认字段", async () => {
    const dir = await createTempDir();
    const configPath = path.join(dir, "radar-profile.json");

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        language: "zh-CN",
        stableProfile: {
          interests: [{ label: "AI Agent", weight: 1.4 }],
          dislikes: [],
          preferredSignals: [],
          notes: ["偏好原始链接"],
        },
        workingProfile: {
          interests: [],
          dislikes: [],
          preferredSignals: [],
          notes: [],
        },
        trustedSources: [{ handle: "@openai", label: "OpenAI", weight: -1, enabled: true }],
        searchTopics: [{ id: "agents", label: "AI Agents", query: "AI coding agents", enabled: true }],
      }),
      "utf8",
    );

    const config = await loadRadarProfileConfig(configPath);

    expect(config.stableProfile.interests[0]).toEqual({ label: "AI Agent", weight: 1 });
    expect(config.trustedSources[0]).toMatchObject({ handle: "openai", weight: 0 });
    expect(config.searchTopics[0]).toMatchObject({ cadence: "manual", lookbackDays: 7 });
  });

  it("合并画像补丁时保留高权重信号并追加说明", () => {
    const current = {
      interests: [{ label: "AI Agent", weight: 0.5 }],
      dislikes: [],
      preferredSignals: [],
      notes: ["原始说明"],
    };

    const next = applyRadarProfilePatch(current, {
      interests: [
        { label: "AI Agent", weight: 0.8 },
        { label: "开源模型", weight: 0.6 },
      ],
      notes: ["新的说明"],
    });

    expect(mergeWeightedSignals(current.interests, [{ label: "AI Agent", weight: 0.2 }])[0]?.weight).toBe(0.5);
    expect(next.interests).toEqual([
      { label: "AI Agent", weight: 0.8 },
      { label: "开源模型", weight: 0.6 },
    ]);
    expect(next.notes).toEqual(["原始说明", "新的说明"]);
  });
});
