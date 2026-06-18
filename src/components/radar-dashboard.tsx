"use client";

import {
  Bookmark,
  Check,
  Clock3,
  Database,
  ExternalLink,
  EyeOff,
  Loader2,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tags,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  RadarFeedItem,
  RadarFeedbackResult,
  RadarFeedbackValue,
  RadarInsightDecision,
  RadarProfileInsight,
  RadarRunResult,
  RadarState,
} from "@/lib/radar/types";

type RadarView = "feed" | "pending" | "profile";

type RadarApiError = {
  ok: false;
  code: string;
  message: string;
  detail?: string;
};

type RadarStateResponse =
  | {
      ok: true;
      state: RadarState;
    }
  | RadarApiError;

type RadarInsightResponse =
  | {
      ok: true;
      state: RadarState;
    }
  | RadarApiError;

// formatScore 将 0-1 模型评分转换成百分比文本，便于扫读。
function formatScore(value: number) {
  return `${Math.round(value * 100)}%`;
}

// formatDateTime 尽量按本地时间展示运行和条目时间，非法时间直接回退短横线。
function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// readJsonResponse 统一解析 API 响应；HTTP 失败但有 JSON 时仍返回业务错误体。
async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T;

  if (!response.ok) {
    return body;
  }

  return body;
}

// getErrorMessage 从稳定错误结构中提取展示文本。
function getErrorMessage(response: RadarApiError) {
  return response.detail ? `${response.message} ${response.detail}` : response.message;
}

// ScorePill 展示单个评分，固定宽度避免按钮区布局抖动。
function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{formatScore(value)}</p>
    </div>
  );
}

// SignalList 用于展示 stable/working 画像里的兴趣、避雷和偏好信号。
function SignalList({ title, signals }: { title: string; signals: Array<{ label: string; weight: number }> }) {
  return (
    <section className="rounded-md border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {signals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {signals.map((signal) => (
            <Badge key={`${title}-${signal.label}`} variant="secondary">
              {signal.label} {formatScore(signal.weight)}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">暂无</p>
      )}
    </section>
  );
}

// FeedbackButton 渲染单个条目反馈按钮，并用 title 提供悬浮提示。
function FeedbackButton({
  disabled,
  icon,
  label,
  onClick,
  selected,
  variant = "outline",
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  selected: boolean;
  variant?: "outline" | "secondary" | "destructive";
}) {
  return (
    <Button
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={label}
      type="button"
      variant={selected ? "secondary" : variant}
    >
      {icon}
      {label}
    </Button>
  );
}

// FeedItemCard 展示单条 X 信息，保留 URL、summary、理由、标签和反馈入口。
function FeedItemCard({
  disabled,
  item,
  onFeedback,
}: {
  disabled: boolean;
  item: RadarFeedItem;
  onFeedback: (itemId: string, value: RadarFeedbackValue) => void;
}) {
  return (
    <article className="grid gap-4 rounded-md border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <a
            className="inline-flex max-w-full items-center gap-2 break-words text-base font-semibold text-primary hover:underline"
            href={item.url}
            rel="noreferrer"
            target="_blank"
          >
            <span>{item.title}</span>
            <ExternalLink className="size-4 shrink-0" />
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.authorHandle ? <span>@{item.authorHandle}</span> : null}
            <span>{formatDateTime(item.publishedAt)}</span>
            <Badge variant={item.sourceType === "trusted_source" ? "default" : "outline"}>{item.sourceType}</Badge>
          </div>
        </div>
        {item.feedback ? <Badge variant="secondary">{item.feedback}</Badge> : null}
      </div>

      <p className="text-sm leading-6 text-foreground">{item.summary}</p>

      {item.rawText ? (
        <details className="rounded-md border bg-background p-3 text-sm">
          <summary className="cursor-pointer font-medium">摘要所依据的原文片段</summary>
          <p className="mt-2 whitespace-pre-wrap leading-6 text-muted-foreground">{item.rawText}</p>
        </details>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <Badge key={`${item.id}-${tag}`} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{item.reason}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <ScorePill label="相关" value={item.relevanceScore} />
          <ScorePill label="重要" value={item.importanceScore} />
          <ScorePill label="可信" value={item.trustScore} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <FeedbackButton
          disabled={disabled}
          icon={<ThumbsUp />}
          label="喜欢"
          onClick={() => onFeedback(item.id, "like")}
          selected={item.feedback === "like"}
        />
        <FeedbackButton
          disabled={disabled}
          icon={<ThumbsDown />}
          label="不喜欢"
          onClick={() => onFeedback(item.id, "dislike")}
          selected={item.feedback === "dislike"}
          variant="destructive"
        />
        <FeedbackButton
          disabled={disabled}
          icon={<Bookmark />}
          label="收藏"
          onClick={() => onFeedback(item.id, "save")}
          selected={item.feedback === "save"}
        />
        <FeedbackButton
          disabled={disabled}
          icon={<EyeOff />}
          label="隐藏"
          onClick={() => onFeedback(item.id, "hide")}
          selected={item.feedback === "hide"}
        />
      </div>
    </article>
  );
}

// PendingInsightCard 展示待确认画像建议，用户确认后才进入 stable profile。
function PendingInsightCard({
  disabled,
  insight,
  onDecision,
}: {
  disabled: boolean;
  insight: RadarProfileInsight;
  onDecision: (decision: RadarInsightDecision) => void;
}) {
  return (
    <article className="grid gap-4 rounded-md border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{insight.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.rationale}</p>
        </div>
        <Badge variant="secondary">置信 {formatScore(insight.confidence)}</Badge>
      </div>
      <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
        {JSON.stringify(insight.proposedPatch, null, 2)}
      </pre>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          disabled={disabled}
          onClick={() => onDecision({ insightId: insight.id, action: "accept" })}
          size="sm"
          type="button"
        >
          <Check />
          接受
        </Button>
        <Button
          disabled={disabled}
          onClick={() => onDecision({ insightId: insight.id, action: "reject" })}
          size="sm"
          type="button"
          variant="outline"
        >
          <X />
          拒绝
        </Button>
      </div>
    </article>
  );
}

// RadarDashboard 管理 Radar Feed 的状态拉取、手动运行、反馈和待确认画像交互。
export function RadarDashboard() {
  const [state, setState] = React.useState<RadarState | null>(null);
  const [view, setView] = React.useState<RadarView>("feed");
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [mutatingId, setMutatingId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // loadState 从服务端读取 SQLite 当前状态，不触发 xAI 搜索。
  const loadState = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await readJsonResponse<RadarStateResponse>(await fetch("/api/radar/state", { method: "GET" }));

      if (!response.ok) {
        setError(getErrorMessage(response));
        return;
      }

      setState(response.state);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    // loadInitialState 首屏异步读取状态，只在 await 之后写 React state，符合 React hooks lint 规则。
    async function loadInitialState() {
      try {
        const response = await readJsonResponse<RadarStateResponse>(await fetch("/api/radar/state", { method: "GET" }));

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(getErrorMessage(response));
          return;
        }

        setState(response.state);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : String(requestError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialState();

    return () => {
      cancelled = true;
    };
  }, []);

  // runSearch 手动触发一次 Grok X Search，并用返回状态刷新 feed。
  async function runSearch() {
    setRunning(true);
    setNotice(null);
    setError(null);

    try {
      const response = await readJsonResponse<RadarRunResult>(await fetch("/api/radar/run", { method: "POST" }));

      if (!response.ok) {
        setError(response.detail ? `${response.message} ${response.detail}` : response.message);
        return;
      }

      setState(response.state);
      setView("feed");
      setNotice(`已写入 ${response.insertedCount} 条候选信息。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setRunning(false);
    }
  }

  // sendFeedback 保存用户反馈，并接收可能被 LLM 更新后的 working profile 和 pending insights。
  async function sendFeedback(itemId: string, value: RadarFeedbackValue) {
    setMutatingId(itemId);
    setNotice(null);
    setError(null);

    try {
      const response = await readJsonResponse<RadarFeedbackResult | RadarApiError>(
        await fetch("/api/radar/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ itemId, value }),
        }),
      );

      if (!response.ok) {
        setError(getErrorMessage(response));
        return;
      }

      setState(response.state);
      setNotice(response.warning ?? "反馈已保存。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setMutatingId(null);
    }
  }

  // decideInsight 把用户对 pending insight 的决策提交给服务端。
  async function decideInsight(decision: RadarInsightDecision) {
    setMutatingId(decision.insightId);
    setNotice(null);
    setError(null);

    try {
      const response = await readJsonResponse<RadarInsightResponse>(
        await fetch("/api/radar/insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(decision),
        }),
      );

      if (!response.ok) {
        setError(getErrorMessage(response));
        return;
      }

      setState(response.state);
      setNotice(decision.action === "accept" ? "画像已更新。" : "建议已拒绝。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setMutatingId(null);
    }
  }

  const busy = loading || running || mutatingId !== null;
  const latestRun = state?.recentRuns[0];

  return (
    <div className="grid gap-5">
      <section className="rounded-md border bg-card p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Radar className="size-4" />
              X Radar Feed
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-foreground">高价值信息流</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={loadState} type="button" variant="outline">
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              刷新
            </Button>
            <Button disabled={busy} onClick={runSearch} type="button">
              {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
              手动搜索
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Database className="size-4" />
          <span>SQLite / Drizzle</span>
          <Clock3 className="ml-2 size-4" />
          <span>{latestRun ? `${latestRun.status} ${formatDateTime(latestRun.startedAt)}` : "尚未运行"}</span>
          <ShieldCheck className="ml-2 size-4" />
          <span>{state?.profile.trustedSources.filter((source) => source.enabled).length ?? 0} 个高可信源</span>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
        <Button onClick={() => setView("feed")} type="button" variant={view === "feed" ? "secondary" : "ghost"}>
          <Radar />
          信息流
        </Button>
        <Button onClick={() => setView("pending")} type="button" variant={view === "pending" ? "secondary" : "ghost"}>
          <Check />
          待确认 {state?.pendingInsights.length ?? 0}
        </Button>
        <Button onClick={() => setView("profile")} type="button" variant={view === "profile" ? "secondary" : "ghost"}>
          <Tags />
          画像
        </Button>
      </div>

      {notice ? <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</div> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      {loading && !state ? (
        <section className="rounded-md border bg-card p-4 text-sm text-muted-foreground">正在读取 Radar 状态...</section>
      ) : null}

      {state && view === "feed" ? (
        <section className="grid gap-4">
          {state.items.length > 0 ? (
            state.items.map((item) => (
              <FeedItemCard
                disabled={busy}
                item={item}
                key={item.id}
                onFeedback={(itemId, value) => void sendFeedback(itemId, value)}
              />
            ))
          ) : (
            <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
              还没有信息条目。点击“手动搜索”后会写入候选信息。
            </div>
          )}
        </section>
      ) : null}

      {state && view === "pending" ? (
        <section className="grid gap-4">
          {state.pendingInsights.length > 0 ? (
            state.pendingInsights.map((insight) => (
              <PendingInsightCard
                disabled={busy || mutatingId === insight.id}
                insight={insight}
                key={insight.id}
                onDecision={(decision) => void decideInsight(decision)}
              />
            ))
          ) : (
            <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
              暂无待确认画像建议。新的建议通常来自强烈或反常的 like/dislike。
            </div>
          )}
        </section>
      ) : null}

      {state && view === "profile" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <SignalList title="稳定兴趣" signals={state.profile.stableProfile.interests} />
          <SignalList title="短期兴趣" signals={state.profile.workingProfile.interests} />
          <SignalList title="偏好信号" signals={state.profile.stableProfile.preferredSignals} />
          <SignalList title="避雷信号" signals={state.profile.stableProfile.dislikes} />
          <section className="rounded-md border bg-card p-4 lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold">高可信源</h3>
            <div className="flex flex-wrap gap-2">
              {state.profile.trustedSources.map((source) => (
                <Badge key={source.handle} variant={source.enabled ? "default" : "outline"}>
                  @{source.handle} {formatScore(source.weight)}
                </Badge>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
