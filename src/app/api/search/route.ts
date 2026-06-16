import { searchXNews } from "@/lib/xai/client";
import type { SearchApiResponse, SearchErrorCode } from "@/lib/xai/types";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 300;

// buildErrorResponse 统一构造 API 错误响应，保证前端只需要按 ok 字段分支处理。
function buildErrorResponse(code: SearchErrorCode, message: string, status: number, detail?: string) {
  return Response.json(
    {
      ok: false,
      code,
      message,
      detail,
    } satisfies SearchApiResponse,
    { status },
  );
}

// readJsonBody 安全读取请求体，避免非法 JSON 直接抛出未格式化错误。
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// getQueryFromBody 从未知请求体中提取 query，并拒绝非对象或非字符串输入。
export function getQueryFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("query" in body)) {
    return null;
  }

  const query = (body as { query?: unknown }).query;
  if (typeof query !== "string") {
    return null;
  }

  return query.trim();
}

// validateQuery 校验用户搜索主题，防止空查询和过长查询进入外部 API。
export function validateQuery(query: string | null): { ok: true; query: string } | { ok: false; detail: string } {
  const trimmedQuery = query?.trim() ?? "";

  if (!trimmedQuery) {
    return { ok: false, detail: "搜索主题不能为空。" };
  }

  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    return { ok: false, detail: `搜索主题不能超过 ${MAX_QUERY_LENGTH} 个字符。` };
  }

  return { ok: true, query: trimmedQuery };
}

// POST 接收前端搜索请求，并把真实 xAI 调用限制在服务端执行。
export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const query = getQueryFromBody(body);
  const validation = validateQuery(query);

  if (!validation.ok) {
    return buildErrorResponse("invalid_query", "搜索请求无效。", 400, validation.detail);
  }

  const result = await searchXNews(validation.query);

  if (!result.ok) {
    const status = result.code === "missing_api_key" || result.code === "invalid_query" ? 400 : 502;
    return Response.json(result satisfies SearchApiResponse, { status });
  }

  return Response.json(result satisfies SearchApiResponse);
}
