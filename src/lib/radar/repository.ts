import { and, desc, eq, isNull, ne, or } from "drizzle-orm";

import { createRadarDatabase, type RadarDatabaseConnection } from "./db";
import {
  radarFeedback,
  radarInsights,
  radarItems,
  radarProfileStates,
  radarRuns,
} from "./schema";
import { normalizeHandle, normalizeRadarProfilePatch } from "./profile";
import type {
  RadarFeedItem,
  RadarFeedbackValue,
  RadarGeneratedInsight,
  RadarProfileDocument,
  RadarProfileInsight,
  RadarQueryPlan,
  RadarRunRecord,
  RadarSearchCandidate,
  RadarState,
  RadarTrustedSource,
} from "./types";

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_REASON = "模型未提供命中原因。";

type CreateRepositoryOptions = {
  databaseUrl?: string;
};

type CreateRunInput = {
  queryPlan: RadarQueryPlan;
};

type AddFeedbackInput = {
  itemId: string;
  value: RadarFeedbackValue;
  note?: string;
};

// nowIso 统一生成 ISO 时间戳，方便 SQLite 直接按文本排序。
function nowIso() {
  return new Date().toISOString();
}

// createId 使用 Web Crypto 生成 ID，避免额外引入 nanoid 依赖。
function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

// stringifyJson 将 JSON 字段集中序列化，避免仓储各处散落 JSON.stringify。
function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

// parseJson 安全解析数据库 JSON 字段，损坏时回退到调用方提供的默认值。
function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// isRecord 判断未知 JSON 是否为普通对象，便于从 rawResponse 中读取模型原始字段。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// readRawString 从 rawResponse 中读取字符串字段，并统一 trim。
function readRawString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

// readRawNumber 从 rawResponse 中读取可选数值字段，缺失时保留 undefined。
function readRawNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// readFirstRawNumber 按优先级读取多个候选分数字段，兼容 score 这类简写输出。
function readFirstRawNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readRawNumber(record, key);

    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

// clampScore 将模型评分限制在 0 到 1，避免异常分数影响前端展示。
function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

// extractHandleFromXUrl 从 X 推文 URL 推断作者 handle，补足旧数据缺失 authorHandle 的情况。
function extractHandleFromXUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (!parsedUrl.hostname.toLowerCase().endsWith("x.com")) {
      return null;
    }

    return normalizeHandle(parsedUrl.pathname.split("/").filter(Boolean)[0]);
  } catch {
    return null;
  }
}

// findTrustedSource 用归一化 handle 匹配当前画像中的高可信源配置。
function findTrustedSource(handle: string | null, trustedSources: RadarTrustedSource[]) {
  if (!handle) {
    return null;
  }

  return trustedSources.find((source) => normalizeHandle(source.handle).toLowerCase() === handle.toLowerCase()) ?? null;
}

// resolveSourceType 对旧数据中的 unknown 做展示层回填：命中高可信源时展示 trusted_source。
function resolveSourceType(sourceType: string, trustedSource: RadarTrustedSource | null): RadarFeedItem["sourceType"] {
  if (sourceType === "trusted_source" || sourceType === "profile_match" || sourceType === "general_search") {
    return sourceType;
  }

  return trustedSource ? "trusted_source" : "general_search";
}

// resolveScore 优先使用数据库中已归一化的正分数，旧数据为 0 时从 rawResponse 中回填。
function resolveScore(storedScore: number, rawRecord: Record<string, unknown>, keys: string[]) {
  if (storedScore > 0) {
    return storedScore;
  }

  return clampScore(readFirstRawNumber(rawRecord, keys) ?? 0);
}

// rowToProfile 将 profile state 单行还原为完整画像文档。
function rowToProfile(row: typeof radarProfileStates.$inferSelect): RadarProfileDocument {
  return {
    version: 1,
    language: "zh-CN",
    stableProfile: parseJson(row.stableProfileJson, {
      interests: [],
      dislikes: [],
      preferredSignals: [],
      notes: [],
    }),
    workingProfile: parseJson(row.workingProfileJson, {
      interests: [],
      dislikes: [],
      preferredSignals: [],
      notes: [],
    }),
    trustedSources: parseJson(row.trustedSourcesJson, []),
    searchTopics: parseJson(row.searchTopicsJson, []),
  };
}

// rowToItem 将 SQLite 行转换为前端消费的 feed item。
function rowToItem(row: typeof radarItems.$inferSelect, trustedSources: RadarTrustedSource[] = []): RadarFeedItem {
  const rawResponse = parseJson(row.rawResponseJson, null);
  const rawRecord = isRecord(rawResponse) ? rawResponse : {};
  const authorHandle = row.authorHandle ?? extractHandleFromXUrl(row.url);
  const trustedSource = findTrustedSource(authorHandle, trustedSources);
  const sourceType = resolveSourceType(row.sourceType, trustedSource);
  const fallbackScore = readFirstRawNumber(rawRecord, ["score"]);

  return {
    id: row.id,
    runId: row.runId,
    url: row.url,
    title: row.title,
    authorHandle,
    publishedAt: row.publishedAt,
    summary: row.summary,
    rawText: row.rawText,
    tags: parseJson(row.tagsJson, []),
    relevanceScore: resolveScore(row.relevanceScore, rawRecord, ["relevanceScore", "relevance_score", "score"]),
    importanceScore: resolveScore(row.importanceScore, rawRecord, ["importanceScore", "importance_score", "score"]),
    trustScore:
      row.trustScore > 0
        ? row.trustScore
        : clampScore(readFirstRawNumber(rawRecord, ["trustScore", "trust_score"]) ?? trustedSource?.weight ?? fallbackScore ?? 0),
    reason:
      row.reason && row.reason !== DEFAULT_REASON
        ? row.reason
        : readRawString(rawRecord, "reason") ||
          readRawString(rawRecord, "hitReason") ||
          readRawString(rawRecord, "hit_reason") ||
          row.reason,
    sourceType,
    rawResponse,
    feedback: row.feedback as RadarFeedbackValue | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// rowToRun 将运行记录中的 query plan JSON 还原为稳定结构。
function rowToRun(row: typeof radarRuns.$inferSelect): RadarRunRecord {
  return {
    id: row.id,
    status: row.status as RadarRunRecord["status"],
    queryPlan: parseJson(row.queryPlanJson, { generatedAt: row.startedAt, topics: [], trustedSources: [] }),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorMessage: row.errorMessage,
  };
}

// rowToInsight 将待确认画像建议转换成服务层结构，并对 proposedPatch 做二次清理。
function rowToInsight(row: typeof radarInsights.$inferSelect): RadarProfileInsight {
  return {
    id: row.id,
    itemId: row.itemId,
    status: row.status as RadarProfileInsight["status"],
    title: row.title,
    rationale: row.rationale,
    confidence: clampScore(row.confidence),
    proposedPatch: normalizeRadarProfilePatch(parseJson(row.proposedPatchJson, {})),
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

export class RadarRepository {
  constructor(private readonly connection: RadarDatabaseConnection) {}

  // close 关闭 libSQL 客户端，测试和短生命周期 API route 调用都应显式释放。
  async close() {
    await this.connection.close();
  }

  // initializeProfile 在数据库首次使用时写入配置种子，已有画像时不会覆盖用户学习结果。
  async initializeProfile(profile: RadarProfileDocument) {
    const existingRows = await this.connection.db
      .select()
      .from(radarProfileStates)
      .where(eq(radarProfileStates.id, DEFAULT_PROFILE_ID))
      .limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const timestamp = nowIso();
    await this.connection.db.insert(radarProfileStates).values({
      id: DEFAULT_PROFILE_ID,
      stableProfileJson: stringifyJson(profile.stableProfile),
      workingProfileJson: stringifyJson(profile.workingProfile),
      trustedSourcesJson: stringifyJson(profile.trustedSources),
      searchTopicsJson: stringifyJson(profile.searchTopics),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  // getProfile 读取当前画像；调用方应先执行 initializeProfile。
  async getProfile() {
    const rows = await this.connection.db
      .select()
      .from(radarProfileStates)
      .where(eq(radarProfileStates.id, DEFAULT_PROFILE_ID))
      .limit(1);

    if (!rows[0]) {
      throw new Error("Radar profile has not been initialized.");
    }

    return rowToProfile(rows[0]);
  }

  // saveProfile 保存 working/stable 画像和配置化高可信源、主题。
  async saveProfile(profile: RadarProfileDocument) {
    await this.connection.db
      .update(radarProfileStates)
      .set({
        stableProfileJson: stringifyJson(profile.stableProfile),
        workingProfileJson: stringifyJson(profile.workingProfile),
        trustedSourcesJson: stringifyJson(profile.trustedSources),
        searchTopicsJson: stringifyJson(profile.searchTopics),
        updatedAt: nowIso(),
      })
      .where(eq(radarProfileStates.id, DEFAULT_PROFILE_ID));
  }

  // createRun 创建一次手动搜索运行记录，后续成功或失败都会更新同一行。
  async createRun(input: CreateRunInput) {
    const timestamp = nowIso();
    const run = {
      id: createId("run"),
      status: "running" as const,
      queryPlan: input.queryPlan,
      startedAt: timestamp,
      finishedAt: null,
      errorMessage: null,
    } satisfies RadarRunRecord;

    await this.connection.db.insert(radarRuns).values({
      id: run.id,
      status: run.status,
      queryPlanJson: stringifyJson(input.queryPlan),
      startedAt: timestamp,
      finishedAt: null,
      errorMessage: null,
      rawResponseJson: null,
    });

    return run;
  }

  // completeRun 将运行标记为成功，并保存 xAI 原始响应用于调试。
  async completeRun(runId: string, rawResponse: unknown) {
    await this.connection.db
      .update(radarRuns)
      .set({
        status: "completed",
        rawResponseJson: stringifyJson(rawResponse),
        finishedAt: nowIso(),
      })
      .where(eq(radarRuns.id, runId));
  }

  // failRun 将运行标记为失败，错误信息会展示在 recentRuns 中。
  async failRun(runId: string, errorMessage: string) {
    await this.connection.db
      .update(radarRuns)
      .set({
        status: "failed",
        errorMessage,
        finishedAt: nowIso(),
      })
      .where(eq(radarRuns.id, runId));
  }

  // upsertItems 以 URL 为唯一键写入搜索条目，重复 URL 会更新评分和摘要但保留原 ID。
  async upsertItems(runId: string, candidates: RadarSearchCandidate[]) {
    const timestamp = nowIso();
    const urls = candidates.map((item) => item.url);

    for (const candidate of candidates) {
      await this.connection.db
        .insert(radarItems)
        .values({
          id: createId("item"),
          runId,
          url: candidate.url,
          title: candidate.title,
          authorHandle: candidate.authorHandle,
          publishedAt: candidate.publishedAt,
          summary: candidate.summary,
          rawText: candidate.rawText,
          tagsJson: stringifyJson(candidate.tags),
          relevanceScore: clampScore(candidate.relevanceScore),
          importanceScore: clampScore(candidate.importanceScore),
          trustScore: clampScore(candidate.trustScore),
          reason: candidate.reason,
          sourceType: candidate.sourceType,
          rawResponseJson: stringifyJson(candidate.rawResponse ?? null),
          feedback: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: radarItems.url,
          set: {
            runId,
            title: candidate.title,
            authorHandle: candidate.authorHandle,
            publishedAt: candidate.publishedAt,
            summary: candidate.summary,
            rawText: candidate.rawText,
            tagsJson: stringifyJson(candidate.tags),
            relevanceScore: clampScore(candidate.relevanceScore),
            importanceScore: clampScore(candidate.importanceScore),
            trustScore: clampScore(candidate.trustScore),
            reason: candidate.reason,
            sourceType: candidate.sourceType,
            rawResponseJson: stringifyJson(candidate.rawResponse ?? null),
            updatedAt: timestamp,
          },
        });
    }

    if (urls.length === 0) {
      return [];
    }

    const rows = await this.connection.db.select().from(radarItems);
    return rows.filter((row) => urls.includes(row.url)).map((row) => rowToItem(row));
  }

  // addFeedback 保存用户反馈，并把条目的当前 feedback 字段更新为最新状态。
  async addFeedback(input: AddFeedbackInput) {
    const timestamp = nowIso();

    await this.connection.db.insert(radarFeedback).values({
      id: createId("feedback"),
      itemId: input.itemId,
      value: input.value,
      note: input.note?.trim() || null,
      createdAt: timestamp,
    });

    await this.connection.db
      .update(radarItems)
      .set({
        feedback: input.value,
        updatedAt: timestamp,
      })
      .where(eq(radarItems.id, input.itemId));

    return this.getItem(input.itemId);
  }

  // getItem 按 ID 读取单条 feed item，供反馈分析传给模型。
  async getItem(itemId: string) {
    const rows = await this.connection.db.select().from(radarItems).where(eq(radarItems.id, itemId)).limit(1);

    if (!rows[0]) {
      throw new Error(`Radar item not found: ${itemId}`);
    }

    return rowToItem(rows[0]);
  }

  // createInsight 写入一条待确认画像更新建议。
  async createInsight(input: RadarGeneratedInsight & { itemId?: string | null }) {
    const timestamp = nowIso();
    const insight = {
      id: createId("insight"),
      itemId: input.itemId ?? null,
      status: "pending" as const,
      title: input.title,
      rationale: input.rationale,
      confidence: clampScore(input.confidence),
      proposedPatch: normalizeRadarProfilePatch(input.proposedPatch),
      createdAt: timestamp,
      decidedAt: null,
    } satisfies RadarProfileInsight;

    await this.connection.db.insert(radarInsights).values({
      id: insight.id,
      itemId: insight.itemId,
      status: insight.status,
      title: insight.title,
      rationale: insight.rationale,
      confidence: insight.confidence,
      proposedPatchJson: stringifyJson(insight.proposedPatch),
      createdAt: timestamp,
      decidedAt: null,
    });

    return insight;
  }

  // getInsight 读取单条画像建议，用于用户接受或拒绝。
  async getInsight(insightId: string) {
    const rows = await this.connection.db.select().from(radarInsights).where(eq(radarInsights.id, insightId)).limit(1);

    if (!rows[0]) {
      throw new Error(`Radar insight not found: ${insightId}`);
    }

    return rowToInsight(rows[0]);
  }

  // updateInsightStatus 标记画像建议的用户决策结果。
  async updateInsightStatus(insightId: string, status: "accepted" | "rejected") {
    await this.connection.db
      .update(radarInsights)
      .set({
        status,
        decidedAt: nowIso(),
      })
      .where(and(eq(radarInsights.id, insightId), eq(radarInsights.status, "pending")));
  }

  // getState 汇总首页需要的画像、feed、待确认建议和最近运行记录。
  async getState(): Promise<RadarState> {
    const profile = await this.getProfile();
    const [itemRows, insightRows, runRows] = await Promise.all([
      this.connection.db
        .select()
        .from(radarItems)
        .where(or(isNull(radarItems.feedback), ne(radarItems.feedback, "hide")))
        .orderBy(desc(radarItems.updatedAt))
        .limit(50),
      this.connection.db
        .select()
        .from(radarInsights)
        .where(eq(radarInsights.status, "pending"))
        .orderBy(desc(radarInsights.createdAt))
        .limit(30),
      this.connection.db.select().from(radarRuns).orderBy(desc(radarRuns.startedAt)).limit(10),
    ]);

    return {
      profile,
      items: itemRows.map((row) => rowToItem(row, profile.trustedSources)),
      pendingInsights: insightRows.map(rowToInsight),
      recentRuns: runRows.map(rowToRun),
    };
  }
}

// createRadarRepository 打开仓储实例，调用方负责在 finally 中 close。
export async function createRadarRepository(options: CreateRepositoryOptions = {}) {
  const connection = await createRadarDatabase(options.databaseUrl);

  return new RadarRepository(connection);
}
