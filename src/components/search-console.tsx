"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2, Search, TerminalSquare } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SearchApiResponse, SearchErrorResponse, SearchSuccessResponse } from "@/lib/xai/types";

type SearchState = "idle" | "loading" | "success" | "error";

// formatCost 把 xAI cost ticks 转成美元字符串，字段缺失时返回短横线。
function formatCost(costUsdTicks?: number) {
  if (typeof costUsdTicks !== "number") {
    return "-";
  }

  return `$${(costUsdTicks / 10_000_000_000).toFixed(6)}`;
}

// formatNumber 把 usage 数值格式化为本地化字符串，字段缺失时返回短横线。
function formatNumber(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return value.toLocaleString();
}

// getErrorHint 根据稳定错误码生成下一步排查提示。
function getErrorHint(error: SearchErrorResponse) {
  switch (error.code) {
    case "missing_api_key":
      return "在 .env.local 中配置 XAI_API_KEY 后重启 pnpm dev。";
    case "xai_http_error":
      return "检查 API key、账号额度、模型权限和 xAI 返回的 detail。";
    case "xai_timeout":
      return "缩短搜索主题或增大 XAI_TIMEOUT_MS 后重试。";
    case "x_search_not_called":
      return "当前响应没有 x_search_call，不能确认 X Search 被执行。";
    case "no_report_text":
      return "工具已调用但没有最终文本，可展开原始响应定位输出结构。";
    case "xai_invalid_response":
      return "xAI 返回结构不符合当前解析器预期，请查看原始响应。";
    case "invalid_query":
      return "输入 1 到 300 个字符的搜索主题。";
    default:
      return "展开原始响应查看细节。";
  }
}

// ResultPanel 展示成功搜索后的报告、引用、工具调用、usage 和原始响应。
function ResultPanel({ result }: { result: SearchSuccessResponse }) {
  return (
    <section className="grid gap-5">
      <div className="rounded-md border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" />
          <h2 className="text-base font-semibold">报告</h2>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">{result.report}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-md border bg-background p-4">
          <h2 className="mb-3 text-base font-semibold">引用</h2>
          {result.citations.length > 0 ? (
            <ol className="grid gap-2 text-sm">
              {result.citations.map((citation, index) => (
                <li key={`${citation.url}-${index}`} className="break-all rounded-md bg-muted px-3 py-2">
                  <a className="font-medium text-primary hover:underline" href={citation.url} target="_blank">
                    {citation.title ? `[${citation.title}] ` : ""}
                    {citation.url}
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">本次响应没有返回结构化引用。</p>
          )}
        </section>

        <section className="rounded-md border bg-background p-4">
          <h2 className="mb-3 text-base font-semibold">调用与成本</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">x_search_call</p>
              <p className="font-semibold">{result.toolCalls.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">耗时</p>
              <p className="font-semibold">{result.elapsedMs}ms</p>
            </div>
            <div>
              <p className="text-muted-foreground">输入 tokens</p>
              <p className="font-semibold">{formatNumber(result.usage?.inputTokens)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">输出 tokens</p>
              <p className="font-semibold">{formatNumber(result.usage?.outputTokens)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">工具次数</p>
              <p className="font-semibold">{formatNumber(result.usage?.numServerSideToolsUsed)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">成本</p>
              <p className="font-semibold">{formatCost(result.usage?.costUsdTicks)}</p>
            </div>
          </div>
        </section>
      </div>

      <details className="rounded-md border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold">原始响应</summary>
        <pre className="mt-3 max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
          {JSON.stringify(result.rawResponse, null, 2)}
        </pre>
      </details>
    </section>
  );
}

// ErrorPanel 展示失败响应，并给出用户可以立即执行的排查建议。
function ErrorPanel({ error }: { error: SearchErrorResponse }) {
  return (
    <section className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-4" />
        <h2 className="text-base font-semibold">搜索失败</h2>
      </div>
      <div className="grid gap-2 text-sm">
        <Badge variant="destructive" className="w-fit">
          {error.code}
        </Badge>
        <p className="font-medium">{error.message}</p>
        {error.detail ? <p className="text-muted-foreground">{error.detail}</p> : null}
        <p className="text-muted-foreground">{getErrorHint(error)}</p>
      </div>
      {error.rawResponse ? (
        <details className="mt-4 rounded-md border bg-background p-3">
          <summary className="cursor-pointer text-sm font-semibold">原始错误响应</summary>
          <pre className="mt-3 max-h-[360px] overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
            {JSON.stringify(error.rawResponse, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

// SearchConsole 管理搜索输入、请求状态和结果渲染，是 MVP 的主交互组件。
export function SearchConsole() {
  const [query, setQuery] = React.useState("Grok CLI coding agent");
  const [state, setState] = React.useState<SearchState>("idle");
  const [response, setResponse] = React.useState<SearchApiResponse | null>(null);

  // handleSubmit 调用后端 /api/search，并按统一响应结构更新 UI 状态。
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setState("error");
      setResponse({
        ok: false,
        code: "invalid_query",
        message: "搜索主题不能为空。",
      });
      return;
    }

    setState("loading");
    setResponse(null);

    try {
      const result = (await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmedQuery }),
      }).then((res) => res.json())) as SearchApiResponse;

      setResponse(result);
      setState(result.ok ? "success" : "error");
    } catch (error) {
      setState("error");
      setResponse({
        ok: false,
        code: "xai_http_error",
        message: "浏览器请求本地 API 时失败。",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>搜索台</CardTitle>
            <CardDescription>服务端直接请求 xAI Responses API，并验证 x_search_call。</CardDescription>
          </div>
          <Badge variant={state === "error" ? "destructive" : state === "success" ? "default" : "secondary"}>
            {state === "loading" ? "running" : state}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
          <Input
            aria-label="搜索主题"
            disabled={state === "loading"}
            maxLength={300}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入 X/Twitter 搜索主题"
            value={query}
          />
          <Button className="sm:w-36" disabled={state === "loading"} type="submit">
            {state === "loading" ? <Loader2 className="animate-spin" /> : <Search />}
            搜索
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          <span>同步请求，最长等待由 XAI_TIMEOUT_MS 控制。</span>
          <TerminalSquare className="ml-2 size-4" />
          <span>API key 只在服务端读取。</span>
        </div>

        {state === "loading" ? (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            正在调用 xAI Responses API...
          </div>
        ) : null}

        {response?.ok ? <ResultPanel result={response} /> : null}
        {response && !response.ok ? <ErrorPanel error={response} /> : null}
      </CardContent>
    </Card>
  );
}
