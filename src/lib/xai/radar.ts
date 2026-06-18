import { resolveModel } from "./prompt";
import type { XaiApiEndpoint, XaiMessageInput } from "./types";
import type {
  RadarAiClient,
  RadarAiSearchInput,
  RadarAiSearchResult,
  RadarFeedbackAnalysis,
  RadarFeedbackAnalysisInput,
  RadarGeneratedInsight,
  RadarItemSourceType,
  RadarSearchCandidate,
} from "@/lib/radar/types";
import { normalizeRadarProfilePatch } from "@/lib/radar/profile";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_TIMEOUT_MS = 90_000;
const XAI_ENDPOINT_PATHS = {
  responses: "responses",
  chat_completions: "chat/completions",
} satisfies Record<XaiApiEndpoint, string>;

const SEARCH_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "profileInsights"],
  properties: {
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "url",
          "title",
          "authorHandle",
          "publishedAt",
          "summary",
          "rawText",
          "tags",
          "relevanceScore",
          "importanceScore",
          "trustScore",
          "reason",
          "sourceType",
        ],
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          authorHandle: { type: ["string", "null"] },
          publishedAt: { type: ["string", "null"] },
          summary: { type: "string" },
          rawText: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" }, maxItems: 12 },
          relevanceScore: { type: "number", minimum: 0, maximum: 1 },
          importanceScore: { type: "number", minimum: 0, maximum: 1 },
          trustScore: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
          sourceType: {
            type: "string",
            enum: ["trusted_source", "profile_match", "general_search", "unknown"],
          },
        },
      },
    },
    profileInsights: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "rationale", "confidence", "proposedPatch"],
        properties: {
          title: { type: "string" },
          rationale: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          proposedPatch: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  },
} as const;

const FEEDBACK_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["shouldCreateInsight", "workingProfilePatch", "insight", "explanation"],
  properties: {
    shouldCreateInsight: { type: "boolean" },
    workingProfilePatch: {
      type: "object",
      additionalProperties: true,
    },
    insight: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["title", "rationale", "confidence", "proposedPatch"],
      properties: {
        title: { type: "string" },
        rationale: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        proposedPatch: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
    explanation: { type: "string" },
  },
} as const;

type StructuredFormat = {
  type: "json_schema";
  name: string;
  schema: typeof SEARCH_RESULT_SCHEMA | typeof FEEDBACK_ANALYSIS_SCHEMA;
  strict: true;
};

type XaiRadarClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  apiEndpoint?: XaiApiEndpoint;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

// trimTrailingSlashes 清理 base URL 尾部斜杠，保证 endpoint 拼接稳定。
function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

// stripKnownEndpointPath 移除已包含的 endpoint 路径，避免从 responses 切 chat 时路径叠加。
function stripKnownEndpointPath(value: string) {
  for (const endpointPath of Object.values(XAI_ENDPOINT_PATHS)) {
    const suffix = `/${endpointPath}`;
    if (value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }

  return value;
}

// resolveApiEndpoint 兼容 env 中 chat、chat_completions、chat/completions 等写法。
function resolveApiEndpoint(value?: string): XaiApiEndpoint {
  const normalizedValue = value?.trim().toLowerCase().replace(/[-/]/g, "_");

  if (normalizedValue === "chat" || normalizedValue === "chat_completions") {
    return "chat_completions";
  }

  return "responses";
}

// resolveApiUrl 按 endpoint 模式生成最终请求 URL。
function resolveApiUrl(baseUrl: string | undefined, endpoint: XaiApiEndpoint) {
  const normalizedBaseUrl = trimTrailingSlashes(baseUrl?.trim() || DEFAULT_XAI_BASE_URL);
  const endpointPath = XAI_ENDPOINT_PATHS[endpoint];

  if (normalizedBaseUrl.endsWith(`/${endpointPath}`)) {
    return normalizedBaseUrl;
  }

  return `${stripKnownEndpointPath(normalizedBaseUrl)}/${endpointPath}`;
}

// resolveTimeoutMs 解析单次 Radar 调用超时，非法值回退到 90 秒。
function resolveTimeoutMs(value?: number | string) {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (Number.isFinite(numericValue) && numericValue >= 1_000) {
    return numericValue;
  }

  return DEFAULT_TIMEOUT_MS;
}

// isRecord 判断未知值是否为可读取字段的对象。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// readString 安全读取字符串字段，并清理首尾空白。
function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

// readNullableString 读取可空字符串，空字符串会按 null 处理。
function readNullableString(record: Record<string, unknown>, key: string) {
  const value = readString(record, key);
  return value || null;
}

// readNumber 读取数值字段，缺失或非法时返回 0。
function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// readStringArray 读取字符串数组并去除空标签。
function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

// clampScore 将模型返回分数限制到 0 到 1。
function clampScore(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

// buildStructuredFormat 生成 xAI Responses API 所需的 text.format 配置。
function buildStructuredFormat(name: string, schema: StructuredFormat["schema"]): StructuredFormat {
  return {
    type: "json_schema",
    name,
    schema,
    strict: true,
  };
}

// buildSearchMessages 将当前画像、可信源和主题压缩进模型上下文，要求模型返回条目而不是报告。
function buildSearchMessages(input: RadarAiSearchInput): XaiMessageInput[] {
  return [
    {
      role: "system",
      content:
        "你是一个面向中文读者的 X 信息雷达。你必须使用 X Search 结果，抽取高价值推文链接，并输出结构化 JSON。不要写报告，不要编造 URL。",
    },
    {
      role: "user",
      content: [
        "请根据以下用户画像与搜索计划，搜索 X 上的新信息。",
        "输出 items 时必须优先给出 x.com 推文 URL、中文 summary、命中原因、标签和 0-1 分数。",
        "summary 可以自由发挥，但必须让用户在不打开链接时大致理解原文内容。",
        "profileInsights 只放值得进入待确认页的画像建议；没有就返回空数组。",
        `稳定画像：${JSON.stringify(input.profile.stableProfile)}`,
        `短期画像：${JSON.stringify(input.profile.workingProfile)}`,
        `高可信源：${JSON.stringify(input.queryPlan.trustedSources)}`,
        `搜索主题：${JSON.stringify(input.queryPlan.topics)}`,
      ].join("\n"),
    },
  ];
}

// buildFeedbackMessages 要求模型把显式反馈解释成短期画像补丁和可选待确认建议。
function buildFeedbackMessages(input: RadarFeedbackAnalysisInput): XaiMessageInput[] {
  return [
    {
      role: "system",
      content:
        "你是一个推荐系统画像分析器。你要根据用户对 X 信息条目的反馈，判断是否应更新短期画像，以及是否提出待确认的稳定画像建议。",
    },
    {
      role: "user",
      content: [
        "请分析这次反馈。不是每次反馈都需要创建 insight；只有反常或强信号才创建。",
        "低模型分但用户 like、标签不匹配但用户 like、模型以为相关但用户 dislike，都应优先考虑创建 insight。",
        `当前画像：${JSON.stringify(input.profile)}`,
        `条目：${JSON.stringify(input.item)}`,
        `反馈：${input.value}`,
        `备注：${input.note ?? ""}`,
      ].join("\n"),
    },
  ];
}

// buildResponsesRequest 构造 Responses API 请求；搜索请求启用 x_search，反馈分析不启用外部工具。
function buildResponsesRequest(messages: XaiMessageInput[], format: StructuredFormat, options: XaiRadarClientOptions, useXSearch: boolean) {
  return {
    model: resolveModel(options.model ?? process.env.XAI_MODEL),
    store: false,
    ...(useXSearch
      ? {
          tool_choice: "required",
          max_turns: 3,
          tools: [
            {
              type: "x_search",
            },
          ],
        }
      : {}),
    reasoning: {
      effort: "low",
    },
    input: messages,
    text: {
      format,
    },
  };
}

// buildChatRequest 构造 Chat Completions 请求；不发送 reasoning 字段，避免兼容网关注入后冲突。
function buildChatRequest(messages: XaiMessageInput[], format: StructuredFormat, options: XaiRadarClientOptions, useXSearch: boolean) {
  return {
    model: resolveModel(options.model ?? process.env.XAI_MODEL),
    stream: false,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: format.name,
        schema: format.schema,
        strict: true,
      },
    },
    ...(useXSearch
      ? {
          search_parameters: {
            mode: "on",
            return_citations: true,
            sources: [
              {
                type: "x",
              },
            ],
          },
        }
      : {}),
  };
}

// readErrorBody 尽力读取 xAI 错误响应，方便 API route 给出可排查 detail。
async function readErrorBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

// extractResponsesText 从 Responses output_text 中提取结构化 JSON 字符串。
function extractResponsesText(rawResponse: unknown) {
  if (!isRecord(rawResponse)) {
    return "";
  }

  if (isRecord(rawResponse.output_parsed)) {
    return JSON.stringify(rawResponse.output_parsed);
  }

  const output = rawResponse.output;
  const textParts: string[] = [];

  if (!Array.isArray(output)) {
    return "";
  }

  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (!isRecord(contentItem) || contentItem.type !== "output_text") {
        continue;
      }

      const text = readString(contentItem, "text");
      if (text) {
        textParts.push(text);
      }
    }
  }

  return textParts.join("\n").trim();
}

// extractChatText 从 Chat choices[].message 中提取 JSON 字符串，兼容 parsed 字段。
function extractChatText(rawResponse: unknown) {
  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.choices)) {
    return "";
  }

  const choice = rawResponse.choices.find((item) => isRecord(item) && isRecord(item.message));
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return "";
  }

  if (isRecord(choice.message.parsed)) {
    return JSON.stringify(choice.message.parsed);
  }

  return typeof choice.message.content === "string" ? choice.message.content.trim() : "";
}

// parseStructuredJson 根据 endpoint 差异提取并解析模型的结构化 JSON 文本。
function parseStructuredJson(rawResponse: unknown, endpoint: XaiApiEndpoint) {
  const text = endpoint === "chat_completions" ? extractChatText(rawResponse) : extractResponsesText(rawResponse);
  const jsonText = extractJsonText(text);

  if (!jsonText) {
    throw new Error("xAI Radar 响应中没有可解析的结构化文本。");
  }

  return JSON.parse(jsonText) as unknown;
}

// extractJsonText 兼容模型偶尔把结构化 JSON 包在 ```json fenced block 里的情况。
function extractJsonText(text: string) {
  const trimmedText = text.trim();
  const fencedMatch = trimmedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmedText;
}

// normalizeSourceType 校验 sourceType 枚举，异常值统一归为 unknown。
function normalizeSourceType(value: string): RadarItemSourceType {
  if (value === "trusted_source" || value === "profile_match" || value === "general_search" || value === "unknown") {
    return value;
  }

  return "unknown";
}

// normalizeSearchCandidate 清理单条模型输出，URL 或 summary 缺失时丢弃。
function normalizeSearchCandidate(value: unknown): RadarSearchCandidate | null {
  const record = isRecord(value) ? value : {};
  const url = readString(record, "url");
  const summary = readString(record, "summary");

  if (!url || !summary) {
    return null;
  }

  return {
    url,
    title: readString(record, "title") || url,
    authorHandle: readNullableString(record, "authorHandle"),
    publishedAt: readNullableString(record, "publishedAt"),
    summary,
    rawText: readNullableString(record, "rawText"),
    tags: readStringArray(record, "tags"),
    relevanceScore: clampScore(readNumber(record, "relevanceScore")),
    importanceScore: clampScore(readNumber(record, "importanceScore")),
    trustScore: clampScore(readNumber(record, "trustScore")),
    reason: readString(record, "reason") || "模型未提供命中原因。",
    sourceType: normalizeSourceType(readString(record, "sourceType")),
    rawResponse: value,
  };
}

// normalizeGeneratedInsight 清理待确认画像建议，缺少标题或理由时丢弃。
function normalizeGeneratedInsight(value: unknown): RadarGeneratedInsight | null {
  const record = isRecord(value) ? value : {};
  const title = readString(record, "title");
  const rationale = readString(record, "rationale");

  if (!title || !rationale) {
    return null;
  }

  return {
    title,
    rationale,
    confidence: clampScore(readNumber(record, "confidence")),
    proposedPatch: normalizeRadarProfilePatch(record.proposedPatch),
  };
}

// normalizeSearchResult 将结构化 JSON 转成仓储可保存的 RadarAiSearchResult。
function normalizeSearchResult(value: unknown, rawResponse: unknown, elapsedMs: number): RadarAiSearchResult {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items)
    ? record.items.map(normalizeSearchCandidate).filter((item): item is RadarSearchCandidate => item !== null)
    : [];
  const profileInsights = Array.isArray(record.profileInsights)
    ? record.profileInsights
        .map(normalizeGeneratedInsight)
        .filter((item): item is RadarGeneratedInsight => item !== null)
    : [];

  return {
    items,
    profileInsights,
    rawResponse,
    elapsedMs,
  };
}

// normalizeFeedbackAnalysis 将结构化反馈分析转成服务层可执行的画像补丁。
function normalizeFeedbackAnalysis(value: unknown, rawResponse: unknown): RadarFeedbackAnalysis {
  const record = isRecord(value) ? value : {};
  const insight = normalizeGeneratedInsight(record.insight);

  return {
    shouldCreateInsight: record.shouldCreateInsight === true,
    workingProfilePatch: normalizeRadarProfilePatch(record.workingProfilePatch),
    insight,
    explanation: readString(record, "explanation"),
    rawResponse,
  };
}

// callStructuredXai 统一执行 xAI 结构化请求，并返回原始响应和解析后的 JSON。
async function callStructuredXai(
  messages: XaiMessageInput[],
  format: StructuredFormat,
  options: XaiRadarClientOptions,
  useXSearch: boolean,
) {
  const apiKey = options.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("缺少 XAI_API_KEY，无法执行 Radar LLM 调用。");
  }

  const endpoint = options.apiEndpoint ?? resolveApiEndpoint(process.env.XAI_API_ENDPOINT);
  const apiUrl = resolveApiUrl(options.baseUrl ?? process.env.XAI_BASE_URL, endpoint);
  const timeoutMs = resolveTimeoutMs(options.timeoutMs ?? process.env.XAI_TIMEOUT_MS);
  const requestBody =
    endpoint === "chat_completions"
      ? buildChatRequest(messages, format, options, useXSearch)
      : buildResponsesRequest(messages, format, options, useXSearch);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await (options.fetchImpl ?? fetch)(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`xAI Radar API 返回 HTTP ${response.status}: ${await readErrorBody(response)}`);
    }

    const rawResponse = await response.json();
    return {
      rawResponse,
      data: parseStructuredJson(rawResponse, endpoint),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// createXaiRadarClient 创建默认 Grok Radar 客户端，服务层可在测试中注入替身。
export function createXaiRadarClient(options: XaiRadarClientOptions = {}): RadarAiClient {
  return {
    async search(input) {
      const result = await callStructuredXai(
        buildSearchMessages(input),
        buildStructuredFormat("radar_search_result", SEARCH_RESULT_SCHEMA),
        options,
        true,
      );

      return normalizeSearchResult(result.data, result.rawResponse, result.elapsedMs);
    },

    async analyzeFeedback(input) {
      const result = await callStructuredXai(
        buildFeedbackMessages(input),
        buildStructuredFormat("radar_feedback_analysis", FEEDBACK_ANALYSIS_SCHEMA),
        options,
        false,
      );

      return normalizeFeedbackAnalysis(result.data, result.rawResponse);
    },
  };
}
