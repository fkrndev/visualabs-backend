/**
 * In-memory progress store for Shopee analysis & draft generation.
 * No DB persistence needed — cleared on process restart.
 */

export type ProgressPhase = "analyzing" | "generating_drafts" | "done" | "error";

export type ProgressInfo = {
  phase: ProgressPhase;
  step: number;       // current step (1-based)
  total: number;      // total steps
  percent: number;    // 0-100
  message: string;    // human-readable label
  startedAt: number;  // epoch ms
  updatedAt: number;  // epoch ms
};

// sessionId → progress
const progressMap = new Map<number, ProgressInfo>();

export function setProgress(sessionId: number, info: Omit<ProgressInfo, "startedAt" | "updatedAt" | "percent"> & { percent?: number }): void {
  const existing = progressMap.get(sessionId);
  const percent = info.percent ?? (info.total > 0 ? Math.round((info.step / info.total) * 100) : 0);
  progressMap.set(sessionId, {
    ...info,
    percent,
    startedAt: existing?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  });
}

export function getProgress(sessionId: number): ProgressInfo | null {
  return progressMap.get(sessionId) ?? null;
}

export function clearProgress(sessionId: number): void {
  progressMap.delete(sessionId);
}
