import path from "node:path";
import { defineConfig } from "vitest/config";

// Vitest 使用 Node 环境测试服务端解析与 API route，不加载浏览器 DOM。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
