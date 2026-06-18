export type RadarWeightedSignal = {
  label: string;
  weight: number;
  reason?: string;
};

export type RadarProfileSection = {
  interests: RadarWeightedSignal[];
  dislikes: RadarWeightedSignal[];
  preferredSignals: RadarWeightedSignal[];
  notes: string[];
};

export type RadarTrustedSource = {
  handle: string;
  label: string;
  weight: number;
  enabled: boolean;
  notes?: string;
};

export type RadarSearchTopic = {
  id: string;
  label: string;
  query: string;
  enabled: boolean;
  cadence: string;
  lookbackDays: number;
};

export type RadarProfileDocument = {
  version: 1;
  language: "zh-CN";
  stableProfile: RadarProfileSection;
  workingProfile: RadarProfileSection;
  trustedSources: RadarTrustedSource[];
  searchTopics: RadarSearchTopic[];
};

export type RadarProfilePatch = Partial<{
  interests: RadarWeightedSignal[];
  dislikes: RadarWeightedSignal[];
  preferredSignals: RadarWeightedSignal[];
  notes: string[];
  trustedSources: RadarTrustedSource[];
}>;

export type RadarQueryPlan = {
  generatedAt: string;
  topics: RadarSearchTopic[];
  trustedSources: RadarTrustedSource[];
};

export type RadarItemSourceType = "trusted_source" | "profile_match" | "general_search" | "unknown";

export type RadarSearchCandidate = {
  url: string;
  title: string;
  authorHandle: string | null;
  publishedAt: string | null;
  summary: string;
  rawText: string | null;
  tags: string[];
  relevanceScore: number;
  importanceScore: number;
  trustScore: number;
  reason: string;
  sourceType: RadarItemSourceType;
  rawResponse?: unknown;
};

export type RadarFeedbackValue = "like" | "dislike" | "save" | "hide";

export type RadarFeedItem = RadarSearchCandidate & {
  id: string;
  runId: string;
  feedback: RadarFeedbackValue | null;
  createdAt: string;
  updatedAt: string;
};

export type RadarInsightStatus = "pending" | "accepted" | "rejected";

export type RadarGeneratedInsight = {
  title: string;
  rationale: string;
  confidence: number;
  proposedPatch: RadarProfilePatch;
};

export type RadarProfileInsight = RadarGeneratedInsight & {
  id: string;
  itemId: string | null;
  status: RadarInsightStatus;
  createdAt: string;
  decidedAt: string | null;
};

export type RadarRunStatus = "running" | "completed" | "failed";

export type RadarRunRecord = {
  id: string;
  status: RadarRunStatus;
  queryPlan: RadarQueryPlan;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type RadarState = {
  profile: RadarProfileDocument;
  items: RadarFeedItem[];
  pendingInsights: RadarProfileInsight[];
  recentRuns: RadarRunRecord[];
};

export type RadarAiSearchInput = {
  profile: RadarProfileDocument;
  queryPlan: RadarQueryPlan;
};

export type RadarAiSearchResult = {
  items: RadarSearchCandidate[];
  profileInsights: RadarGeneratedInsight[];
  rawResponse: unknown;
  elapsedMs: number;
};

export type RadarFeedbackAnalysisInput = {
  profile: RadarProfileDocument;
  item: RadarFeedItem;
  value: RadarFeedbackValue;
  note?: string;
};

export type RadarFeedbackAnalysis = {
  shouldCreateInsight: boolean;
  workingProfilePatch?: RadarProfilePatch;
  insight?: RadarGeneratedInsight | null;
  explanation?: string;
  rawResponse?: unknown;
};

export type RadarAiClient = {
  search(input: RadarAiSearchInput): Promise<RadarAiSearchResult>;
  analyzeFeedback(input: RadarFeedbackAnalysisInput): Promise<RadarFeedbackAnalysis>;
};

export type RadarServiceOptions = {
  configPath?: string;
  databaseUrl?: string;
  aiClient?: RadarAiClient;
};

export type RadarRunResult =
  | {
      ok: true;
      state: RadarState;
      insertedCount: number;
    }
  | {
      ok: false;
      code: "radar_search_failed" | "radar_profile_missing";
      message: string;
      detail?: string;
    };

export type RadarFeedbackResult = {
  ok: true;
  state: RadarState;
  warning?: string;
};

export type RadarInsightDecision = {
  insightId: string;
  action: "accept" | "reject";
};
