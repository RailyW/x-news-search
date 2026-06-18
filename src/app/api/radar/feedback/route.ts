import { radarService } from "@/lib/radar/service";
import type { RadarFeedbackValue } from "@/lib/radar/types";

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

// isFeedbackValue 校验前端反馈值，避免任意字符串写入数据库。
function isFeedbackValue(value: unknown): value is RadarFeedbackValue {
  return value === "like" || value === "dislike" || value === "save" || value === "hide";
}

// parseFeedbackBody 从请求体中提取 itemId、value 和可选备注。
export function parseFeedbackBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return { ok: false as const, detail: "请求体必须是 JSON 对象。" };
  }

  const record = body as Record<string, unknown>;
  const itemId = typeof record.itemId === "string" ? record.itemId.trim() : "";
  const value = record.value;
  const note = typeof record.note === "string" ? record.note.trim() : undefined;

  if (!itemId) {
    return { ok: false as const, detail: "itemId 不能为空。" };
  }

  if (!isFeedbackValue(value)) {
    return { ok: false as const, detail: "value 必须是 like、dislike、save 或 hide。" };
  }

  return {
    ok: true as const,
    itemId,
    value,
    note,
  };
}

// POST 保存用户反馈，并尝试触发 LLM 画像分析。
export async function POST(request: Request) {
  const parsed = parseFeedbackBody(await readJsonBody(request));

  if (!parsed.ok) {
    return Response.json(
      {
        ok: false,
        code: "invalid_feedback",
        message: "反馈请求无效。",
        detail: parsed.detail,
      },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await radarService.recordItemFeedback({
        itemId: parsed.itemId,
        value: parsed.value,
        note: parsed.note,
      }),
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        code: "radar_feedback_failed",
        message: "保存反馈失败。",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
