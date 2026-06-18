import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  RadarProfileDocument,
  RadarProfilePatch,
  RadarProfileSection,
  RadarSearchTopic,
  RadarTrustedSource,
  RadarWeightedSignal,
} from "./types";

const DEFAULT_CADENCE = "manual";
const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_WEIGHT = 1;
const MIN_WEIGHT = 0;
const MAX_PROFILE_NOTES = 80;

// getDefaultRadarProfileConfigPath 返回仓库内的示例画像配置路径，作为首次启动的种子文件。
export function getDefaultRadarProfileConfigPath() {
  return path.join(process.cwd(), "config", "radar-profile.example.json");
}

// clampWeight 将模型或手写配置中的权重限制在 0 到 1，避免异常值污染推荐排序。
export function clampWeight(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return MIN_WEIGHT;
  }

  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, numericValue));
}

// readRecord 只接受普通对象，避免数组、null 或原始值进入配置解析流程。
function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

// readString 从未知对象中读取字符串字段，并统一 trim 空白字符。
function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

// readBoolean 从未知对象中读取布尔字段，缺失时使用调用方提供的默认值。
function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

// normalizeHandle 统一移除 @ 前缀和 URL 路径，只保留 X handle 本体。
export function normalizeHandle(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/^@/, "").replace(/^https?:\/\/x\.com\//i, "").split(/[/?#]/)[0] ?? "";
}

// normalizeWeightedSignal 解析单个画像信号，字段不完整时返回 null 让调用方丢弃。
function normalizeWeightedSignal(value: unknown): RadarWeightedSignal | null {
  const record = readRecord(value);
  const label = readString(record, "label");

  if (!label) {
    return null;
  }

  const signal: RadarWeightedSignal = {
    label,
    weight: clampWeight(record.weight),
  };
  const reason = readString(record, "reason");

  if (reason) {
    signal.reason = reason;
  }

  return signal;
}

// normalizeWeightedSignals 解析画像信号列表，并按 label 去重保留最高权重。
export function normalizeWeightedSignals(value: unknown): RadarWeightedSignal[] {
  const rawItems = Array.isArray(value) ? value : [];
  const signals = rawItems.map(normalizeWeightedSignal).filter((item): item is RadarWeightedSignal => item !== null);

  return mergeWeightedSignals([], signals);
}

// mergeWeightedSignals 合并同名画像信号，保留较高权重和更具体的 reason。
export function mergeWeightedSignals(current: RadarWeightedSignal[], incoming: RadarWeightedSignal[]) {
  const byLabel = new Map<string, RadarWeightedSignal>();

  for (const signal of [...current, ...incoming]) {
    const labelKey = signal.label.trim().toLowerCase();
    const existing = byLabel.get(labelKey);

    if (!existing || signal.weight > existing.weight) {
      byLabel.set(labelKey, {
        label: signal.label.trim(),
        weight: clampWeight(signal.weight),
        ...(signal.reason ? { reason: signal.reason.trim() } : {}),
      });
      continue;
    }

    if (!existing.reason && signal.reason) {
      byLabel.set(labelKey, { ...existing, reason: signal.reason.trim() });
    }
  }

  return Array.from(byLabel.values()).sort((left, right) => right.weight - left.weight);
}

// normalizeNotes 清理空说明并去重，限制总量避免画像文档无限膨胀。
function normalizeNotes(value: unknown) {
  const rawNotes = Array.isArray(value) ? value : [];
  const notes = rawNotes.filter((item): item is string => typeof item === "string").map((item) => item.trim());

  return Array.from(new Set(notes.filter(Boolean))).slice(0, MAX_PROFILE_NOTES);
}

// normalizeProfileSection 解析 stable/working 画像片段，缺失字段会落到空集合。
export function normalizeProfileSection(value: unknown): RadarProfileSection {
  const record = readRecord(value);

  return {
    interests: normalizeWeightedSignals(record.interests),
    dislikes: normalizeWeightedSignals(record.dislikes),
    preferredSignals: normalizeWeightedSignals(record.preferredSignals),
    notes: normalizeNotes(record.notes),
  };
}

// normalizeTrustedSources 解析高可信源配置，禁用项会保留，便于 UI 后续展示和重新启用。
export function normalizeTrustedSources(value: unknown): RadarTrustedSource[] {
  const rawItems = Array.isArray(value) ? value : [];

  return rawItems
    .map((item) => {
      const record = readRecord(item);
      const handle = normalizeHandle(record.handle);

      if (!handle) {
        return null;
      }

      const source: RadarTrustedSource = {
        handle,
        label: readString(record, "label") || handle,
        weight: clampWeight(record.weight),
        enabled: readBoolean(record, "enabled", true),
      };
      const notes = readString(record, "notes");

      if (notes) {
        source.notes = notes;
      }

      return source;
    })
    .filter((item): item is RadarTrustedSource => item !== null);
}

// normalizeSearchTopics 解析手动搜索主题，cadence 在 MVP 里只保存不调度，后续可直接接定时任务。
export function normalizeSearchTopics(value: unknown): RadarSearchTopic[] {
  const rawItems = Array.isArray(value) ? value : [];

  return rawItems
    .map((item) => {
      const record = readRecord(item);
      const id = readString(record, "id");
      const query = readString(record, "query");

      if (!id || !query) {
        return null;
      }

      return {
        id,
        label: readString(record, "label") || id,
        query,
        enabled: readBoolean(record, "enabled", true),
        cadence: readString(record, "cadence") || DEFAULT_CADENCE,
        lookbackDays: Math.max(1, Math.min(30, Number(record.lookbackDays) || DEFAULT_LOOKBACK_DAYS)),
      } satisfies RadarSearchTopic;
    })
    .filter((item): item is RadarSearchTopic => item !== null);
}

// normalizeRadarProfileDocument 将任意 JSON 归一化为项目内部稳定消费的画像文档。
export function normalizeRadarProfileDocument(value: unknown): RadarProfileDocument {
  const record = readRecord(value);

  if (record.version !== 1) {
    throw new Error("Radar 画像配置 version 必须为 1。");
  }

  return {
    version: 1,
    language: "zh-CN",
    stableProfile: normalizeProfileSection(record.stableProfile),
    workingProfile: normalizeProfileSection(record.workingProfile),
    trustedSources: normalizeTrustedSources(record.trustedSources),
    searchTopics: normalizeSearchTopics(record.searchTopics),
  };
}

// loadRadarProfileConfig 从环境变量或示例文件加载画像配置，作为数据库首次初始化种子。
export async function loadRadarProfileConfig(configPath = process.env.RADAR_PROFILE_CONFIG_PATH) {
  const resolvedPath = configPath?.trim() ? path.resolve(configPath) : getDefaultRadarProfileConfigPath();
  const rawContent = await readFile(resolvedPath, "utf8");

  return normalizeRadarProfileDocument(JSON.parse(rawContent));
}

// normalizeRadarProfilePatch 清理 LLM 产生的画像补丁，避免任意 JSON 直接进入稳定画像。
export function normalizeRadarProfilePatch(value: unknown): RadarProfilePatch {
  const record = readRecord(value);
  const patch: RadarProfilePatch = {};
  const interests = normalizeWeightedSignals(record.interests);
  const dislikes = normalizeWeightedSignals(record.dislikes);
  const preferredSignals = normalizeWeightedSignals(record.preferredSignals);
  const notes = normalizeNotes(record.notes);
  const trustedSources = normalizeTrustedSources(record.trustedSources);

  if (interests.length > 0) {
    patch.interests = interests;
  }

  if (dislikes.length > 0) {
    patch.dislikes = dislikes;
  }

  if (preferredSignals.length > 0) {
    patch.preferredSignals = preferredSignals;
  }

  if (notes.length > 0) {
    patch.notes = notes;
  }

  if (trustedSources.length > 0) {
    patch.trustedSources = trustedSources;
  }

  return patch;
}

// applyRadarProfilePatch 将 LLM 画像补丁应用到单个画像片段，供 working/stable 两层画像复用。
export function applyRadarProfilePatch(profile: RadarProfileSection, patch: RadarProfilePatch): RadarProfileSection {
  return {
    interests: mergeWeightedSignals(profile.interests, patch.interests ?? []),
    dislikes: mergeWeightedSignals(profile.dislikes, patch.dislikes ?? []),
    preferredSignals: mergeWeightedSignals(profile.preferredSignals, patch.preferredSignals ?? []),
    notes: normalizeNotes([...(profile.notes ?? []), ...(patch.notes ?? [])]),
  };
}

// applyPatchToRadarProfile 将补丁写入指定画像层，并可同步合并新配置的高可信源。
export function applyPatchToRadarProfile(
  profile: RadarProfileDocument,
  patch: RadarProfilePatch,
  target: "stableProfile" | "workingProfile",
): RadarProfileDocument {
  return {
    ...profile,
    [target]: applyRadarProfilePatch(profile[target], patch),
    trustedSources:
      patch.trustedSources && patch.trustedSources.length > 0
        ? mergeTrustedSources(profile.trustedSources, patch.trustedSources)
        : profile.trustedSources,
  };
}

// mergeTrustedSources 合并高可信源，保留同 handle 的最高权重和最新说明。
function mergeTrustedSources(current: RadarTrustedSource[], incoming: RadarTrustedSource[]) {
  const byHandle = new Map<string, RadarTrustedSource>();

  for (const source of [...current, ...incoming]) {
    const handle = normalizeHandle(source.handle);
    const existing = byHandle.get(handle);

    if (!existing || source.weight >= existing.weight) {
      byHandle.set(handle, {
        ...source,
        handle,
        weight: clampWeight(source.weight),
        enabled: source.enabled,
      });
    }
  }

  return Array.from(byHandle.values()).sort((left, right) => right.weight - left.weight);
}
