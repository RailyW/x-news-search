import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import * as schema from "./schema";

const DEFAULT_DATABASE_URL = "file:./data/radar.sqlite";

export type RadarDatabase = LibSQLDatabase<typeof schema>;

export type RadarDatabaseConnection = {
  client: Client;
  db: RadarDatabase;
  databaseUrl: string;
  close: () => Promise<void>;
};

// resolveRadarDatabaseUrl 统一解析数据库地址，默认落到仓库 data/radar.sqlite。
export function resolveRadarDatabaseUrl(value = process.env.RADAR_DATABASE_URL) {
  const configuredValue = value?.trim() || DEFAULT_DATABASE_URL;
  const normalizedValue = configuredValue.replace(/\\/g, "/");

  if (normalizedValue.startsWith("file:")) {
    return normalizedValue;
  }

  return `file:${normalizedValue}`;
}

// getLocalDatabasePath 从 file: URL 中还原本地路径，用于在首次连接前创建父目录。
function getLocalDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const rawPath = databaseUrl.slice("file:".length);

  if (!rawPath || rawPath === ":memory:") {
    return null;
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawPath);
}

// ensureDatabaseDirectory 确保 SQLite 文件所在目录存在，避免首次运行因 data/ 缺失失败。
async function ensureDatabaseDirectory(databaseUrl: string) {
  const localPath = getLocalDatabasePath(databaseUrl);

  if (!localPath) {
    return;
  }

  await mkdir(path.dirname(localPath), { recursive: true });
}

// ensureRadarSchema 使用显式 DDL 创建 MVP 表结构；Drizzle schema 负责后续类型安全查询。
async function ensureRadarSchema(client: Client) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS radar_profile_states (
      id TEXT PRIMARY KEY NOT NULL,
      stable_profile_json TEXT NOT NULL,
      working_profile_json TEXT NOT NULL,
      trusted_sources_json TEXT NOT NULL,
      search_topics_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS radar_runs (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      query_plan_json TEXT NOT NULL,
      raw_response_json TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS radar_items (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author_handle TEXT,
      published_at TEXT,
      summary TEXT NOT NULL,
      raw_text TEXT,
      tags_json TEXT NOT NULL,
      relevance_score REAL NOT NULL,
      importance_score REAL NOT NULL,
      trust_score REAL NOT NULL,
      reason TEXT NOT NULL,
      source_type TEXT NOT NULL,
      raw_response_json TEXT,
      feedback TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS radar_feedback (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL,
      value TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS radar_insights (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      confidence REAL NOT NULL,
      proposed_patch_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      decided_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS radar_items_updated_at_idx ON radar_items(updated_at)`,
    `CREATE INDEX IF NOT EXISTS radar_insights_status_idx ON radar_insights(status)`,
    `CREATE INDEX IF NOT EXISTS radar_runs_started_at_idx ON radar_runs(started_at)`,
  ];

  for (const statement of statements) {
    await client.execute(statement);
  }
}

// createRadarDatabase 打开本地 SQLite 连接，并在返回前确保表结构存在。
export async function createRadarDatabase(databaseUrl = resolveRadarDatabaseUrl()): Promise<RadarDatabaseConnection> {
  const resolvedDatabaseUrl = resolveRadarDatabaseUrl(databaseUrl);

  await ensureDatabaseDirectory(resolvedDatabaseUrl);

  const client = createClient({ url: resolvedDatabaseUrl });
  const db = drizzle(client, { schema });

  await ensureRadarSchema(client);

  return {
    client,
    db,
    databaseUrl: resolvedDatabaseUrl,
    close: async () => {
      await client.close();
    },
  };
}
