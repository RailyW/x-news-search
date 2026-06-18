import { buildChatCompletionsRequest, buildResponsesRequest } from "./prompt";
import { parseXaiChatCompletionResponse, parseXaiResponse } from "./parser";
import type { SearchApiResponse, XaiApiEndpoint, XaiClientOptions } from "./types";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const XAI_ENDPOINT_PATHS = {
  responses: "responses",
  chat_completions: "chat/completions",
} satisfies Record<XaiApiEndpoint, string>;
const DEFAULT_TIMEOUT_MS = 90_000;

// trimTrailingSlashes 移除 base URL 末尾的斜杠，保证后续拼接 endpoint 时不会出现双斜杠。
function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

// stripKnownEndpointPath 移除 base URL 中可能已经包含的接口路径，确保切换 endpoint 时路径不会串台。
function stripKnownEndpointPath(value: string) {
  for (const endpointPath of Object.values(XAI_ENDPOINT_PATHS)) {
    const suffix = `/${endpointPath}`;
    if (value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }

  return value;
}

// resolveApiEndpoint 解析接口模式，兼容 chat、chat_completions、chat-completions 等常见写法。
function resolveApiEndpoint(value?: string): XaiApiEndpoint {
  const normalizedValue = value?.trim().toLowerCase().replace(/[-/]/g, "_");

  if (normalizedValue === "chat" || normalizedValue === "chat_completions") {
    return "chat_completions";
  }

  return "responses";
}

// resolveApiUrl 根据调用参数或环境变量生成最终 xAI API 地址。
// 允许调用方传入根地址或完整 endpoint 地址，便于兼容代理网关。
function resolveApiUrl(baseUrl: string | undefined, endpoint: XaiApiEndpoint) {
  const configuredBaseUrl = baseUrl?.trim();
  const normalizedBaseUrl = trimTrailingSlashes(configuredBaseUrl || DEFAULT_XAI_BASE_URL);
  const endpointPath = XAI_ENDPOINT_PATHS[endpoint];

  if (normalizedBaseUrl.endsWith(`/${endpointPath}`)) {
    return normalizedBaseUrl;
  }

  return `${stripKnownEndpointPath(normalizedBaseUrl)}/${endpointPath}`;
}

// resolveTimeoutMs 解析超时时间，非法或过小的值回退到默认 90 秒。
function resolveTimeoutMs(value?: number | string) {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (Number.isFinite(numericValue) && numericValue >= 1_000) {
    return numericValue;
  }

  return DEFAULT_TIMEOUT_MS;
}

// isAbortError 判断 fetch 是否因 AbortController 取消，用于统一映射为 xai_timeout。
function isAbortError(error: unknown) {
  return isErrorLike(error) && error.name === "AbortError";
}

// isErrorLike 判断未知异常是否至少具备 Error 的 name/message 字段。
function isErrorLike(error: unknown): error is { name?: string; message?: string } {
  return typeof error === "object" && error !== null;
}

// readErrorBody 尽力读取 xAI HTTP 错误响应，优先保留 JSON，失败时回退文本。
async function readErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

// readSuccessJson 解析成功响应 JSON，非法 JSON 会映射为 xai_invalid_response。
async function readSuccessJson(response: Response): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
}

// searchXNews 调用 xAI Responses API，启用 x_search，并返回前端稳定响应结构。
export async function searchXNews(query: string, options: XaiClientOptions = {}): Promise<SearchApiResponse> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      ok: false,
      code: "invalid_query",
      message: "搜索主题不能为空。",
    };
  }

  const apiKey = options.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey?.trim()) {
    return {
      ok: false,
      code: "missing_api_key",
      message: "缺少 XAI_API_KEY，请在 .env.local 中配置 xAI API key。",
    };
  }

  const model = options.model ?? process.env.XAI_MODEL;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs ?? process.env.XAI_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiEndpoint = options.apiEndpoint ?? resolveApiEndpoint(process.env.XAI_API_ENDPOINT);
  const apiUrl = resolveApiUrl(options.baseUrl ?? process.env.XAI_BASE_URL, apiEndpoint);
  const requestBody =
    apiEndpoint === "chat_completions"
      ? buildChatCompletionsRequest(trimmedQuery, model)
      : buildResponsesRequest(trimmedQuery, model);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      return {
        ok: false,
        code: "xai_http_error",
        message: `xAI API 返回 HTTP ${response.status}。`,
        detail: typeof errorBody === "string" ? errorBody : JSON.stringify(errorBody),
        rawResponse: errorBody,
      };
    }

    const json = await readSuccessJson(response);
    if (!json.ok) {
      return {
        ok: false,
        code: "xai_invalid_response",
        message: "xAI API 返回的成功响应不是合法 JSON。",
      };
    }

    const parsed =
      apiEndpoint === "chat_completions"
        ? parseXaiChatCompletionResponse(json.data)
        : parseXaiResponse(json.data);
    if (!parsed.ok) {
      return {
        ...parsed,
        rawResponse: json.data,
      };
    }

    return {
      ok: true,
      query: trimmedQuery,
      responseId: parsed.responseId,
      model: parsed.model,
      report: parsed.report,
      citations: parsed.citations,
      toolCalls: parsed.toolCalls,
      usage: parsed.usage,
      rawResponse: json.data,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        code: "xai_timeout",
        message: `xAI API 请求超过 ${timeoutMs}ms 后已取消。`,
      };
    }

    return {
      ok: false,
      code: "xai_http_error",
      message: "请求 xAI API 时发生网络错误。",
      detail: isErrorLike(error) ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
