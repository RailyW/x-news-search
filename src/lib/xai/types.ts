export type SearchErrorCode =
  | "invalid_query"
  | "missing_api_key"
  | "xai_http_error"
  | "xai_timeout"
  | "xai_invalid_response"
  | "x_search_not_called"
  | "no_report_text";

export type SearchRequest = {
  query: string;
};

export type SearchCitation = {
  url: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
};

export type SearchToolCall = {
  type: "x_search_call";
  status?: string;
  raw: unknown;
};

export type SearchUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  numServerSideToolsUsed?: number;
  costUsdTicks?: number;
};

export type SearchSuccessResponse = {
  ok: true;
  query: string;
  responseId: string;
  model: string;
  report: string;
  citations: SearchCitation[];
  toolCalls: SearchToolCall[];
  usage?: SearchUsage;
  rawResponse: unknown;
  elapsedMs: number;
};

export type SearchErrorResponse = {
  ok: false;
  code: SearchErrorCode;
  message: string;
  detail?: string;
  rawResponse?: unknown;
};

export type SearchApiResponse = SearchSuccessResponse | SearchErrorResponse;

export type XaiMessageInput = {
  role: "system" | "user";
  content: string;
};

export type XaiResponsesRequest = {
  model: string;
  store: false;
  tool_choice: "required";
  max_turns: number;
  reasoning: {
    effort: "low";
  };
  input: XaiMessageInput[];
  tools: Array<{
    type: "x_search";
  }>;
};

export type XaiParsedSuccess = {
  ok: true;
  responseId: string;
  model: string;
  report: string;
  citations: SearchCitation[];
  toolCalls: SearchToolCall[];
  usage?: SearchUsage;
};

export type XaiParsedFailure = {
  ok: false;
  code: "x_search_not_called" | "no_report_text" | "xai_invalid_response";
  message: string;
  detail?: string;
};

export type XaiParsedResponse = XaiParsedSuccess | XaiParsedFailure;

export type XaiClientOptions = {
  // apiKey 覆盖服务端环境变量 XAI_API_KEY，主要用于测试或内部服务端调用。
  apiKey?: string;
  // baseUrl 覆盖服务端环境变量 XAI_BASE_URL，可传 xAI API 根地址或完整 responses 地址。
  baseUrl?: string;
  // model 覆盖服务端环境变量 XAI_MODEL，用于切换 Responses API 调用模型。
  model?: string;
  // timeoutMs 覆盖服务端环境变量 XAI_TIMEOUT_MS，用于控制单次搜索请求最长等待时间。
  timeoutMs?: number;
  // fetchImpl 注入 fetch 实现，便于单元测试在不访问真实网络的情况下验证请求行为。
  fetchImpl?: typeof fetch;
};
