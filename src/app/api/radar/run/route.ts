import { radarService } from "@/lib/radar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST 手动触发一次 Radar 搜索；MVP 暂不创建后台定时任务。
export async function POST() {
  const result = await radarService.runManualRadarSearch();

  if (!result.ok) {
    return Response.json(result, { status: 502 });
  }

  return Response.json(result);
}
