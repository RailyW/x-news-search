import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X News Search",
  description: "Use xAI Responses API and X Search to generate a sourced news brief.",
};

// RootLayout 负责注入全局 HTML 结构，并让所有页面继承统一语言与基础样式。
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
