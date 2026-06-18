import { afterEach, describe, expect, it, vi } from "vitest";

import { getQueryFromBody, POST, validateQuery } from "@/app/api/search/route";

// createJsonResponse 构造模拟 xAI 响应，供 route 集成测试复用。
function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

// createSearchRequest 构造 Next route 可直接消费的 Request 对象。
function createSearchRequest(body: unknown) {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/search route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("能从请求体中提取并修剪 query", () => {
    expect(getQueryFromBody({ query: "  Grok  " })).toBe("Grok");
    expect(getQueryFromBody({ query: 123 })).toBeNull();
  });

  it("空 query 校验失败", () => {
    expect(validateQuery(null).ok).toBe(false);
    expect(validateQuery("   ").ok).toBe(false);
  });

  it("成功返回统一 SearchSuccessResponse", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_API_ENDPOINT", "responses");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          id: "resp_route",
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
                  text: "路由测试报告",
                  annotations: [],
                },
              ],
            },
          ],
          citations: ["https://x.com/i/status/route"],
          usage: {
            num_server_side_tools_used: 1,
          },
        }),
      ),
    );

    const response = await POST(createSearchRequest({ query: "路由测试" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.report).toBe("路由测试报告");
    expect(body.toolCalls).toHaveLength(1);
  });

  it("xAI HTTP 错误会返回 xai_http_error", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({ error: "rate limited" }, { status: 429 })),
    );

    const response = await POST(createSearchRequest({ query: "路由测试" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("xai_http_error");
  });
});
