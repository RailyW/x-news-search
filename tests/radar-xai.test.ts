import { describe, expect, it, vi } from "vitest";

import { createXaiRadarClient } from "@/lib/xai/radar";
import type { RadarAiSearchInput } from "@/lib/radar/types";

// createJsonResponse 构造 xAI Radar 客户端测试用的同步 JSON 响应。
function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

const radarInput: RadarAiSearchInput = {
  profile: {
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
    trustedSources: [{ handle: "openai", label: "OpenAI", weight: 1, enabled: true }],
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
  },
  queryPlan: {
    generatedAt: "2026-06-18T00:00:00.000Z",
    topics: [
      {
        id: "agents",
        label: "AI Agents",
        query: "AI coding agents",
        enabled: true,
        cadence: "manual",
        lookbackDays: 7,
      },
    ],
    trustedSources: [{ handle: "openai", label: "OpenAI", weight: 1, enabled: true }],
  },
};

const searchPayload = {
  items: [
    {
      url: "https://x.com/openai/status/1",
      title: "OpenAI Agent 更新",
      authorHandle: "openai",
      publishedAt: "2026-06-18T00:00:00Z",
      summary: "OpenAI 讨论了 Agent 工具链的新能力。",
      rawText: "OpenAI 讨论 Agent 工具链。",
      tags: ["AI Agent"],
      relevanceScore: 0.9,
      importanceScore: 0.8,
      trustScore: 1,
      reason: "命中高可信源。",
      sourceType: "trusted_source" as const,
    },
  ],
  profileInsights: [],
};

describe("createXaiRadarClient", () => {
  it("Responses 模式会发送 x_search 和 text.format，并解析结构化条目", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(searchPayload),
              },
            ],
          },
        ],
      }),
    );
    const client = createXaiRadarClient({
      apiKey: "test-key",
      apiEndpoint: "responses",
      fetchImpl,
    });

    const result = await client.search(radarInput);
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));

    expect(result.items[0]?.summary).toContain("Agent 工具链");
    expect(requestBody.tools).toEqual([{ type: "x_search" }]);
    expect(requestBody.text.format).toMatchObject({
      type: "json_schema",
      name: "radar_search_result",
      strict: true,
    });
  });

  it("Responses 模式能解析模型返回的 fenced JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: `\`\`\`json\n${JSON.stringify(searchPayload)}\n\`\`\``,
              },
            ],
          },
        ],
      }),
    );
    const client = createXaiRadarClient({
      apiKey: "test-key",
      apiEndpoint: "responses",
      fetchImpl,
    });

    const result = await client.search(radarInput);

    expect(result.items[0]?.url).toBe("https://x.com/openai/status/1");
  });

  it("Responses 模式会兼容 score 和 hitReason 简写字段", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  items: [
                    {
                      url: "https://x.com/openai/status/2",
                      summary: "OpenAI 发布新的 Agent 能力。",
                      hitReason: "OpenAI 官方发布，命中高可信源与 Agent 主题。",
                      tags: ["OpenAI", "Agent"],
                      score: 0.87,
                    },
                  ],
                  profileInsights: [],
                }),
              },
            ],
          },
        ],
      }),
    );
    const client = createXaiRadarClient({
      apiKey: "test-key",
      apiEndpoint: "responses",
      fetchImpl,
    });

    const result = await client.search(radarInput);

    expect(result.items[0]).toMatchObject({
      authorHandle: "openai",
      relevanceScore: 0.87,
      importanceScore: 0.87,
      trustScore: 1,
      reason: "OpenAI 官方发布，命中高可信源与 Agent 主题。",
      sourceType: "trusted_source",
    });
  });

  it("Chat 模式会使用 response_format 和 search_parameters，且不发送 reasoning 字段", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: JSON.stringify(searchPayload),
            },
          },
        ],
      }),
    );
    const client = createXaiRadarClient({
      apiKey: "test-key",
      apiEndpoint: "chat_completions",
      fetchImpl,
    });

    await client.search(radarInput);
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));

    expect(requestBody.reasoning).toBeUndefined();
    expect(requestBody.reasoning_effort).toBeUndefined();
    expect(requestBody.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "radar_search_result",
        strict: true,
      },
    });
    expect(requestBody.search_parameters.sources).toEqual([{ type: "x" }]);
  });

  it("反馈分析不会启用 x_search，并能解析 working profile 补丁", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shouldCreateInsight: true,
                  workingProfilePatch: {
                    interests: [{ label: "开发者 Agent 工具链", weight: 0.7 }],
                  },
                  insight: null,
                  explanation: "like 说明用户对该主题更感兴趣。",
                }),
              },
            ],
          },
        ],
      }),
    );
    const client = createXaiRadarClient({
      apiKey: "test-key",
      apiEndpoint: "responses",
      fetchImpl,
    });

    const result = await client.analyzeFeedback({
      profile: radarInput.profile,
      item: {
        id: "item_1",
        runId: "run_1",
        feedback: "like",
        createdAt: "2026-06-18T00:00:00Z",
        updatedAt: "2026-06-18T00:00:00Z",
        ...searchPayload.items[0]!,
      },
      value: "like",
    });
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));

    expect(requestBody.tools).toBeUndefined();
    expect(result.workingProfilePatch?.interests?.[0]?.label).toBe("开发者 Agent 工具链");
  });
});
