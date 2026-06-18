import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// radarProfileStates 保存当前用户画像。MVP 使用 default 单行，后续可扩展为多用户或多工作区。
export const radarProfileStates = sqliteTable("radar_profile_states", {
  id: text("id").primaryKey(),
  stableProfileJson: text("stable_profile_json").notNull(),
  workingProfileJson: text("working_profile_json").notNull(),
  trustedSourcesJson: text("trusted_sources_json").notNull(),
  searchTopicsJson: text("search_topics_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// radarRuns 记录每次手动检索，便于观察查询计划、失败原因和后续接入定时任务。
export const radarRuns = sqliteTable("radar_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  queryPlanJson: text("query_plan_json").notNull(),
  rawResponseJson: text("raw_response_json"),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

// radarItems 保存从 Grok X Search 中提取出的条目，每条都以 URL 去重并保留模型评分。
export const radarItems = sqliteTable("radar_items", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  authorHandle: text("author_handle"),
  publishedAt: text("published_at"),
  summary: text("summary").notNull(),
  rawText: text("raw_text"),
  tagsJson: text("tags_json").notNull(),
  relevanceScore: real("relevance_score").notNull(),
  importanceScore: real("importance_score").notNull(),
  trustScore: real("trust_score").notNull(),
  reason: text("reason").notNull(),
  sourceType: text("source_type").notNull(),
  rawResponseJson: text("raw_response_json"),
  feedback: text("feedback"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// radarFeedback 记录用户对条目的显式反馈，是 LLM 画像更新的主要训练信号。
export const radarFeedback = sqliteTable("radar_feedback", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  value: text("value").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

// radarInsights 保存模型提出但尚需用户确认的稳定画像更新建议。
export const radarInsights = sqliteTable("radar_insights", {
  id: text("id").primaryKey(),
  itemId: text("item_id"),
  status: text("status").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  confidence: real("confidence").notNull(),
  proposedPatchJson: text("proposed_patch_json").notNull(),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
});
