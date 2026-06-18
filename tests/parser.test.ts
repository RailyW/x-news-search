import { describe, expect, it } from "vitest";

import { parseXaiChatCompletionResponse, parseXaiResponse } from "@/lib/xai/parser";

// buildSuccessfulFixture 构造最小成功响应，便于多个解析测试复用。
function buildSuccessfulFixture() {
  return {
    id: "resp_123",
    model: "grok-4.3",
    output: [
      {
        type: "x_search_call",
        status: "completed",
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "结论摘要\n这是一个测试报告。[[1]](https://x.com/test/status/1)",
            annotations: [
              {
                type: "url_citation",
                url: "https://x.com/test/status/1",
                title: "1",
                start_index: 16,
                end_index: 52,
              },
            ],
          },
        ],
      },
    ],
    citations: ["https://x.com/test/status/1", "https://x.ai/news"],
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      total_tokens: 140,
      num_server_side_tools_used: 1,
      cost_in_usd_ticks: 123456,
    },
  };
}

describe("parseXaiResponse", () => {
  it("能从包含 x_search_call 的响应中提取报告、引用和 usage", () => {
    const parsed = parseXaiResponse(buildSuccessfulFixture());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("解析结果应当成功。");
    }

    expect(parsed.report).toContain("测试报告");
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]?.type).toBe("x_search_call");
    expect(parsed.citations.map((item) => item.url)).toContain("https://x.com/test/status/1");
    expect(parsed.citations.map((item) => item.url)).toContain("https://x.ai/news");
    expect(parsed.usage?.costUsdTicks).toBe(123456);
  });

  it("没有 x_search_call 时返回 x_search_not_called", () => {
    const fixture = buildSuccessfulFixture();
    fixture.output = fixture.output.filter((item) => item.type !== "x_search_call");

    const parsed = parseXaiResponse(fixture);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("解析结果应当失败。");
    }

    expect(parsed.code).toBe("x_search_not_called");
  });

  it("有 x_search_call 但没有 output_text 时返回 no_report_text", () => {
    const fixture = buildSuccessfulFixture();
    fixture.output = fixture.output.filter((item) => item.type === "x_search_call");

    const parsed = parseXaiResponse(fixture);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("解析结果应当失败。");
    }

    expect(parsed.code).toBe("no_report_text");
  });

  it("非对象响应返回 xai_invalid_response", () => {
    const parsed = parseXaiResponse(null);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("解析结果应当失败。");
    }

    expect(parsed.code).toBe("xai_invalid_response");
  });
});

describe("parseXaiChatCompletionResponse", () => {
  it("能从 Chat Completions 响应中提取报告、引用和 usage", () => {
    const parsed = parseXaiChatCompletionResponse({
      id: "chatcmpl_123",
      model: "grok-4.3",
      choices: [
        {
          message: {
            role: "assistant",
            content: "Chat 接口报告",
          },
        },
      ],
      citations: [
        {
          url: "https://x.com/test/status/2",
          title: "X 帖子",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 8,
        total_tokens: 18,
        cost_in_usd_ticks: 1000,
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("Chat Completions fixture 应当解析成功。");
    }

    expect(parsed.responseId).toBe("chatcmpl_123");
    expect(parsed.report).toBe("Chat 接口报告");
    expect(parsed.citations[0]?.url).toBe("https://x.com/test/status/2");
    expect(parsed.usage?.inputTokens).toBe(10);
    expect(parsed.usage?.outputTokens).toBe(8);
    expect(parsed.toolCalls).toEqual([]);
  });
});
