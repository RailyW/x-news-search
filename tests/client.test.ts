import { afterEach, describe, expect, it, vi } from "vitest";

import { searchXNews } from "@/lib/xai/client";

// createJsonResponse 构造测试用 Response，避免每个用例重复设置 headers。
function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

describe("searchXNews", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("缺少 API key 时返回 missing_api_key", async () => {
    const result = await searchXNews("xAI", { apiKey: "" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("缺少 API key 时不应成功。");
    }

    expect(result.code).toBe("missing_api_key");
  });

  it("xAI 非 2xx 响应会返回 xai_http_error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({ error: { message: "unauthorized" } }, { status: 401 }),
    );

    const result = await searchXNews("xAI", {
      apiKey: "test-key",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("HTTP 401 时不应成功。");
    }

    expect(result.code).toBe("xai_http_error");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("XAI_BASE_URL 会覆盖默认请求根地址并自动拼接 responses 路径", async () => {
    vi.stubEnv("XAI_BASE_URL", "https://gateway.example.com/xai/v1/");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        id: "resp_base_url",
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
                text: "自定义地址报告",
                annotations: [],
              },
            ],
          },
        ],
      }),
    );

    await searchXNews("xAI", {
      apiKey: "test-key",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://gateway.example.com/xai/v1/responses", expect.any(Object));
  });

  it("成功响应会包含查询、报告和 x_search_call", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        id: "resp_456",
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
                text: "中文报告",
                annotations: [],
              },
            ],
          },
        ],
        citations: ["https://x.com/i/status/1"],
        usage: {
          input_tokens: 12,
          output_tokens: 8,
          total_tokens: 20,
          num_server_side_tools_used: 1,
          cost_in_usd_ticks: 100,
        },
      }),
    );

    const result = await searchXNews(" xAI 最新消息 ", {
      apiKey: "test-key",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("成功 fixture 应当解析成功。");
    }

    expect(result.query).toBe("xAI 最新消息");
    expect(result.report).toBe("中文报告");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.citations[0]?.url).toBe("https://x.com/i/status/1");
  });

  it("请求被 AbortController 取消时返回 xai_timeout", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });

    const promise = searchXNews("xAI", {
      apiKey: "test-key",
      timeoutMs: 1_000,
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    vi.useRealTimers();

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("超时请求不应成功。");
    }

    expect(result.code).toBe("xai_timeout");
  });
});
