import type { XaiChatCompletionsRequest, XaiMessageInput, XaiResponsesRequest } from "./types";

const DEFAULT_MODEL = "grok-4.3";
const MAX_TURNS = 3;

// resolveModel 统一解析模型名，让环境变量缺失时回退到 MVP 默认模型。
export function resolveModel(model?: string) {
  const trimmedModel = model?.trim();

  if (trimmedModel) {
    return trimmedModel;
  }

  return DEFAULT_MODEL;
}

// buildSearchPrompt 生成固定中文任务提示，避免前端直接拼接复杂系统指令。
export function buildSearchPrompt(query: string): XaiMessageInput[] {
  return [
    {
      role: "system",
      content:
        "你是一个面向中文读者的 X/Twitter 新闻搜索助手。必须基于工具搜索结果回答，不要编造没有证据的信息。",
    },
    {
      role: "user",
      content: `请使用 X Search 搜索：${query}。输出中文短报告，包含结论摘要、关键发现、证据链接和不确定性。`,
    },
  ];
}

// buildResponsesRequest 构造 xAI Responses API 请求体，并强制启用 x_search 服务端工具。
export function buildResponsesRequest(query: string, model?: string): XaiResponsesRequest {
  return {
    model: resolveModel(model),
    store: false,
    tool_choice: "required",
    max_turns: MAX_TURNS,
    reasoning: {
      effort: "low",
    },
    input: buildSearchPrompt(query),
    tools: [
      {
        type: "x_search",
      },
    ],
  };
}

// buildChatCompletionsRequest 构造 legacy Chat Completions 请求体。
// Chat 接口没有 Responses API 的 x_search_call 输出项，因此这里使用旧版 search_parameters 强制搜索 X 数据源。
export function buildChatCompletionsRequest(query: string, model?: string): XaiChatCompletionsRequest {
  return {
    model: resolveModel(model),
    stream: false,
    reasoning_effort: "low",
    messages: buildSearchPrompt(query),
    search_parameters: {
      mode: "on",
      return_citations: true,
      sources: [
        {
          type: "x",
        },
      ],
    },
  };
}
