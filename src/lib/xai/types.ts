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
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};
