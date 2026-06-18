import { radarService } from "@/lib/radar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// getErrorMessage 将服务层未知异常转换为稳定 API detail。
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// GET 返回当前 Radar Feed 状态，不触发外部 xAI 请求。
export async function GET() {
  try {
    return Response.json({
      ok: true,
      state: await radarService.getRadarState(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        code: "radar_state_failed",
        message: "读取 Radar 状态失败。",
        detail: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
