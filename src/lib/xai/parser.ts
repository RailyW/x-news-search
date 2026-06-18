import type {
  SearchCitation,
  SearchToolCall,
  SearchUsage,
  XaiParsedResponse,
} from "./types";

// isRecord 判断未知值是否为普通对象，方便后续安全读取嵌套字段。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// readString 只在字段确实为字符串时返回内容，避免把数字或对象误解析为文本。
function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

// readNumber 只在字段确实为数字时返回内容，用于提取 token 和 annotation 下标。
function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

// readFirstNumber 按优先级读取多个候选数字字段，兼容 Responses 与 Chat Completions 的 usage 命名差异。
function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNumber(record, key);
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

// getOutputItems 获取 Responses API 的 output 数组，格式不匹配时返回空数组。
function getOutputItems(rawResponse: unknown): unknown[] {
  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.output)) {
    return [];
  }

  return rawResponse.output;
}

// extractReport 从 message/output_text 项里拼接最终报告文本。
function extractReport(outputItems: unknown[]): string {
  const textParts: string[] = [];

  for (const item of outputItems) {
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

  return textParts.join("\n\n").trim();
}

// extractToolCalls 提取 Responses API 中的 x_search_call 输出项，作为真实触发 X Search 的证据。
function extractToolCalls(outputItems: unknown[]): SearchToolCall[] {
  const toolCalls: SearchToolCall[] = [];

  for (const item of outputItems) {
    if (!isRecord(item) || item.type !== "x_search_call") {
      continue;
    }

    toolCalls.push({
      type: "x_search_call",
      status: readString(item, "status"),
      raw: item,
    });
  }

  return toolCalls;
}

// pushCitation 去重写入 citation，避免顶层 citations 和 annotation 中的同一 URL 重复展示。
function pushCitation(citations: SearchCitation[], citation: SearchCitation) {
  const exists = citations.some(
    (item) =>
      item.url === citation.url &&
      item.startIndex === citation.startIndex &&
      item.endIndex === citation.endIndex,
  );

  if (!exists) {
    citations.push(citation);
  }
}

// extractTopLevelCitations 提取顶层 citations 字段中的 URL，Responses 和 Chat Completions 都可能返回该字段。
function extractTopLevelCitations(rawResponse: unknown, citations: SearchCitation[]) {
  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.citations)) {
    return;
  }

  for (const citation of rawResponse.citations) {
    if (typeof citation === "string") {
      pushCitation(citations, { url: citation });
      continue;
    }

    if (isRecord(citation)) {
      const url = readString(citation, "url");
      if (url) {
        pushCitation(citations, {
          url,
          title: readString(citation, "title"),
          startIndex: readNumber(citation, "start_index"),
          endIndex: readNumber(citation, "end_index"),
        });
      }
    }
  }
}

// extractTopLevelSources 提取部分 Chat Completions 兼容响应中的 sources URL。
function extractTopLevelSources(rawResponse: unknown, citations: SearchCitation[]) {
  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.sources)) {
    return;
  }

  for (const source of rawResponse.sources) {
    if (!isRecord(source)) {
      continue;
    }

    const url = readString(source, "url");
    if (url) {
      pushCitation(citations, {
        url,
        title: readString(source, "title"),
      });
    }
  }
}

// extractAnnotationCitations 从 output_text.annotations 中提取结构化引用链接。
function extractAnnotationCitations(outputItems: unknown[], citations: SearchCitation[]) {
  for (const item of outputItems) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (!isRecord(contentItem) || !Array.isArray(contentItem.annotations)) {
        continue;
      }

      for (const annotation of contentItem.annotations) {
        if (!isRecord(annotation)) {
          continue;
        }

        const url = readString(annotation, "url");
        if (url) {
          pushCitation(citations, {
            url,
            title: readString(annotation, "title"),
            startIndex: readNumber(annotation, "start_index"),
            endIndex: readNumber(annotation, "end_index"),
          });
        }
      }
    }
  }
}

// extractCitations 汇总顶层 citations/sources 和 output_text annotations 中的引用 URL。
function extractCitations(rawResponse: unknown, outputItems: unknown[]): SearchCitation[] {
  const citations: SearchCitation[] = [];

  extractTopLevelCitations(rawResponse, citations);
  extractTopLevelSources(rawResponse, citations);
  extractAnnotationCitations(outputItems, citations);

  return citations;
}

// extractUsage 提取 xAI usage 字段，字段缺失时保留 undefined 以兼容 API 响应变化。
function extractUsage(rawResponse: unknown): SearchUsage | undefined {
  if (!isRecord(rawResponse) || !isRecord(rawResponse.usage)) {
    return undefined;
  }

  return {
    inputTokens: readFirstNumber(rawResponse.usage, ["input_tokens", "prompt_tokens"]),
    outputTokens: readFirstNumber(rawResponse.usage, ["output_tokens", "completion_tokens"]),
    totalTokens: readNumber(rawResponse.usage, "total_tokens"),
    numServerSideToolsUsed: readNumber(rawResponse.usage, "num_server_side_tools_used"),
    costUsdTicks: readNumber(rawResponse.usage, "cost_in_usd_ticks"),
  };
}

// getChatChoices 获取 Chat Completions 的 choices 数组，格式不匹配时返回空数组。
function getChatChoices(rawResponse: unknown): unknown[] {
  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.choices)) {
    return [];
  }

  return rawResponse.choices;
}

// extractChatReport 从 choices[].message.content 中提取最终回复文本。
function extractChatReport(choices: unknown[]): string {
  const textParts: string[] = [];

  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const content = choice.message.content;
    if (typeof content === "string" && content.trim()) {
      textParts.push(content);
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      const text = readString(contentItem, "text");
      if (text) {
        textParts.push(text);
      }
    }
  }

  return textParts.join("\n\n").trim();
}

// extractChatToolCalls 提取 Chat Completions 里可能存在的 tool_calls，兼容未来 xAI 返回工具细节的情况。
function extractChatToolCalls(choices: unknown[]): SearchToolCall[] {
  const toolCalls: SearchToolCall[] = [];

  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.message) || !Array.isArray(choice.message.tool_calls)) {
      continue;
    }

    for (const toolCall of choice.message.tool_calls) {
      toolCalls.push({
        type: "chat_tool_call",
        status: readString(choice, "finish_reason"),
        raw: toolCall,
      });
    }
  }

  return toolCalls;
}

// parseXaiResponse 把 xAI 原始响应转换成前端稳定消费的成功结构或业务错误。
export function parseXaiResponse(rawResponse: unknown): XaiParsedResponse {
  if (!isRecord(rawResponse)) {
    return {
      ok: false,
      code: "xai_invalid_response",
      message: "xAI 返回格式不是对象。",
    };
  }

  const outputItems = getOutputItems(rawResponse);
  if (outputItems.length === 0) {
    return {
      ok: false,
      code: "xai_invalid_response",
      message: "xAI 返回中缺少 output 数组。",
    };
  }

  const toolCalls = extractToolCalls(outputItems);
  if (toolCalls.length === 0) {
    return {
      ok: false,
      code: "x_search_not_called",
      message: "xAI 响应中没有出现 x_search_call，不能确认 X Search 已执行。",
    };
  }

  const report = extractReport(outputItems);
  if (!report) {
    return {
      ok: false,
      code: "no_report_text",
      message: "xAI 已触发 X Search，但没有返回最终报告文本。",
    };
  }

  return {
    ok: true,
    responseId: readString(rawResponse, "id") ?? "",
    model: readString(rawResponse, "model") ?? "",
    report,
    citations: extractCitations(rawResponse, outputItems),
    toolCalls,
    usage: extractUsage(rawResponse),
  };
}

// parseXaiChatCompletionResponse 把 Chat Completions 原始响应转换成前端稳定消费结构。
// Chat 接口没有 Responses 的 x_search_call 输出项，因此这里只要求存在最终文本，并尽量提取引用和 usage。
export function parseXaiChatCompletionResponse(rawResponse: unknown): XaiParsedResponse {
  if (!isRecord(rawResponse)) {
    return {
      ok: false,
      code: "xai_invalid_response",
      message: "xAI Chat Completions 返回格式不是对象。",
    };
  }

  const choices = getChatChoices(rawResponse);
  if (choices.length === 0) {
    return {
      ok: false,
      code: "xai_invalid_response",
      message: "xAI Chat Completions 返回中缺少 choices 数组。",
    };
  }

  const report = extractChatReport(choices);
  if (!report) {
    return {
      ok: false,
      code: "no_report_text",
      message: "xAI Chat Completions 没有返回最终报告文本。",
    };
  }

  return {
    ok: true,
    responseId: readString(rawResponse, "id") ?? "",
    model: readString(rawResponse, "model") ?? "",
    report,
    citations: extractCitations(rawResponse, []),
    toolCalls: extractChatToolCalls(choices),
    usage: extractUsage(rawResponse),
  };
}
