/**
 * 各语言的资源倍增系数
 * Java/Kotlin: 内存 ×5，时间 ×2，最小内存 64MB
 * Python2/3: 内存 ×3，时间 ×2，最小内存 32MB
 * JavaScript/TypeScript: 内存 ×3，时间 ×1，最小内存 32MB
 */
export const LANGUAGE_BONUS: Record<
  string,
  { memoryMultiplier: number; timeMultiplier: number; minMemory?: number }
> = {
  java: { memoryMultiplier: 5, timeMultiplier: 2, minMemory: 64 * 1024 * 1024 },
  kotlin: { memoryMultiplier: 5, timeMultiplier: 2, minMemory: 64 * 1024 * 1024 },
  python2: { memoryMultiplier: 3, timeMultiplier: 2, minMemory: 32 * 1024 * 1024 },
  python3: { memoryMultiplier: 3, timeMultiplier: 2, minMemory: 32 * 1024 * 1024 },
  javascript: { memoryMultiplier: 3, timeMultiplier: 1, minMemory: 32 * 1024 * 1024 },
  typescript: { memoryMultiplier: 3, timeMultiplier: 1, minMemory: 32 * 1024 * 1024 },
}

/** 内存上限 1GB（byte） */
export const MAX_MEMORY_LIMIT = 1024 * 1024 * 1024

/** 语言名称到枚举数字的映射（与原 leverage 兼容） */
export const LANGUAGE_NAME_TO_INT: Record<string, number> = {
  c: 0,
  cpp: 1,
  'c++': 1,
  java: 6,
  kotlin: 7,
  python2: 8,
  python3: 9,
  javascript: 10,
  typescript: 11,
}

/** 枚举数字到语言名称 */
export const LANGUAGE_INT_TO_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(LANGUAGE_NAME_TO_INT).map(([name, id]) => [id, name]),
)
