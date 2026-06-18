import { loadRadarProfileConfig, applyPatchToRadarProfile } from "./profile";
import { createRadarRepository, type RadarRepository } from "./repository";
import { createXaiRadarClient } from "@/lib/xai/radar";
import type {
  RadarAiClient,
  RadarFeedbackAnalysis,
  RadarFeedbackResult,
  RadarFeedbackValue,
  RadarInsightDecision,
  RadarProfileDocument,
  RadarQueryPlan,
  RadarRunResult,
  RadarServiceOptions,
} from "./types";

type RecordFeedbackInput = {
  itemId: string;
  value: RadarFeedbackValue;
  note?: string;
};

// buildRadarQueryPlan 从当前画像中抽取启用的主题和高可信源，形成一次手动搜索计划。
export function buildRadarQueryPlan(profile: RadarProfileDocument): RadarQueryPlan {
  return {
    generatedAt: new Date().toISOString(),
    topics: profile.searchTopics.filter((topic) => topic.enabled),
    trustedSources: profile.trustedSources.filter((source) => source.enabled),
  };
}

// getErrorMessage 将未知异常转换成可展示文本，避免 API route 泄漏完整堆栈。
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// withInitializedRepository 为每次服务操作打开数据库、写入首次画像种子，并自动关闭连接。
async function withInitializedRepository<T>(
  options: RadarServiceOptions,
  callback: (repository: RadarRepository) => Promise<T>,
) {
  const repository = await createRadarRepository({ databaseUrl: options.databaseUrl });

  try {
    await repository.initializeProfile(await loadRadarProfileConfig(options.configPath));
    return await callback(repository);
  } finally {
    await repository.close();
  }
}

// createRadarService 组合配置、仓储和 AI 客户端，是 API route 的主要入口。
export function createRadarService(options: RadarServiceOptions = {}) {
  const aiClient: RadarAiClient = options.aiClient ?? createXaiRadarClient();

  return {
    // getRadarState 返回当前 feed、画像和待确认更新；不会触发外部 API。
    async getRadarState() {
      return withInitializedRepository(options, async (repository) => repository.getState());
    },

    // runManualRadarSearch 手动触发一次 Grok X Search，并将结构化条目写入 SQLite。
    async runManualRadarSearch(): Promise<RadarRunResult> {
      return withInitializedRepository(options, async (repository) => {
        const profile = await repository.getProfile();
        const queryPlan = buildRadarQueryPlan(profile);
        const run = await repository.createRun({ queryPlan });

        try {
          const result = await aiClient.search({ profile, queryPlan });
          const items = await repository.upsertItems(run.id, result.items);

          for (const insight of result.profileInsights) {
            await repository.createInsight({ ...insight, itemId: null });
          }

          await repository.completeRun(run.id, result.rawResponse);

          return {
            ok: true,
            state: await repository.getState(),
            insertedCount: items.length,
          };
        } catch (error) {
          const message = getErrorMessage(error);
          await repository.failRun(run.id, message);

          return {
            ok: false,
            code: "radar_search_failed",
            message: "Radar 手动检索失败。",
            detail: message,
          };
        }
      });
    },

    // recordItemFeedback 保存 like/dislike/save/hide，并让 LLM 判断是否值得提出画像更新。
    async recordItemFeedback(input: RecordFeedbackInput): Promise<RadarFeedbackResult> {
      return withInitializedRepository(options, async (repository) => {
        const item = await repository.addFeedback(input);
        const profile = await repository.getProfile();
        let warning: string | undefined;
        let analysis: RadarFeedbackAnalysis | null = null;

        try {
          analysis = await aiClient.analyzeFeedback({
            profile,
            item,
            value: input.value,
            note: input.note,
          });
        } catch (error) {
          warning = `反馈已保存，但画像分析失败：${getErrorMessage(error)}`;
        }

        if (analysis?.workingProfilePatch) {
          await repository.saveProfile(applyPatchToRadarProfile(profile, analysis.workingProfilePatch, "workingProfile"));
        }

        if (analysis?.shouldCreateInsight && analysis.insight) {
          await repository.createInsight({ ...analysis.insight, itemId: item.id });
        }

        return {
          ok: true,
          state: await repository.getState(),
          warning,
        };
      });
    },

    // decideInsight 将待确认画像建议接受到 stableProfile，或直接拒绝。
    async decideInsight(input: RadarInsightDecision) {
      return withInitializedRepository(options, async (repository) => {
        const insight = await repository.getInsight(input.insightId);

        if (input.action === "accept") {
          const profile = await repository.getProfile();
          await repository.saveProfile(applyPatchToRadarProfile(profile, insight.proposedPatch, "stableProfile"));
          await repository.updateInsightStatus(input.insightId, "accepted");
        } else {
          await repository.updateInsightStatus(input.insightId, "rejected");
        }

        return {
          ok: true,
          state: await repository.getState(),
        };
      });
    },
  };
}

// radarService 是生产 API route 使用的默认单例工厂包装。
export const radarService = createRadarService();
