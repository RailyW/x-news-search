import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn 合并条件类名，并用 tailwind-merge 处理 Tailwind 冲突类。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
