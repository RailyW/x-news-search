import { RadarDashboard } from "@/components/radar-dashboard";

// HomePage 承载 Radar Feed MVP 2.0，把手动搜索、反馈和画像确认放在第一屏。
export default function HomePage() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <RadarDashboard />
      </div>
    </main>
  );
}
