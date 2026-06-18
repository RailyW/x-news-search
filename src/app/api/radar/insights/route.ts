import { radarService } from "@/lib/radar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// readJsonBody 安全读取 JSON 请求体，非法 JSON 会返回 null。
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// isInsightAction 将未知值收窄为服务层接受的决策枚举。
function isInsightAction(value: unknown): value is "accept" | "reject" {
  return value === "accept" || value === "reject";
}

// parseInsightDecisionBody 校验待确认画像建议的用户决策。
export function parseInsightDecisionBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, detail: "请求体必须是 JSON 对象。" };
  }

  const record = body as Record<string, unknown>;
  const insightId = typeof record.insightId === "string" ? record.insightId.trim() : "";
  const action = record.action;

  if (!insightId) {
    return { ok: false as const, detail: "insightId 不能为空。" };
  }

  if (!isInsightAction(action)) {
    return { ok: false as const, detail: "action 必须是 accept 或 reject。" };
  }

  return {
    ok: true as const,
    insightId,
    action,
  };
}

// POST 接受或拒绝一条 pending insight。
export async function POST(request: Request) {
  const parsed = parseInsightDecisionBody(await readJsonBody(request));

  if (!parsed.ok) {
    return Response.json(
      {
        ok: false,
        code: "invalid_insight_decision",
        message: "画像建议决策请求无效。",
        detail: parsed.detail,
      },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await radarService.decideInsight({
        insightId: parsed.insightId,
        action: parsed.action,
      }),
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        code: "radar_insight_failed",
        message: "处理画像建议失败。",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
