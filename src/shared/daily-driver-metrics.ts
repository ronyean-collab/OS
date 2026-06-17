/** Shared shape for local daily-driver telemetry (no user content). */

export type DailyDriverMetricTotals = {
  appLaunches: number;
  sessionDurationMs: number;
  threadCountPeak: number;
  providerSwitches: number;
  recoveryEvents: number;
  savepointCount: number;
  exportCount: number;
  importCount: number;
  continuityRebuildCount: number;
  compressionCycles: number;
};

export type DailyDriverSessionRecord = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
};

export type DailyDriverMetricsFile = {
  version: number;
  updatedAt: string;
  totals: DailyDriverMetricTotals;
  sessions: DailyDriverSessionRecord[];
  currentSession: { id: string; startedAt: string } | null;
};
