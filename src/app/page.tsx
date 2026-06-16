import { SearchConsole } from "@/components/search-console";

// HomePage 只承载 MVP 的主搜索台，避免引入额外导航和营销内容。
export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Responses API + X Search</p>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">X News Search</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            输入一个主题，服务端会调用 xAI Responses API，并验证返回中是否出现 x_search_call。
          </p>
        </header>
        <SearchConsole />
      </div>
    </main>
  );
}
