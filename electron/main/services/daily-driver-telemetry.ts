/**
 * Local-only daily driver metrics — no cloud, no user content, no secrets.
 * Stored at {userData}/daily-driver-metrics.json
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { v4 as uuid } from "uuid";

export const DAILY_DRIVER_METRICS_VERSION = 1;
export const DAILY_DRIVER_METRICS_FILENAME = "daily-driver-metrics.json";

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

function emptyTotals(): DailyDriverMetricTotals {
  return {
    appLaunches: 0,
    sessionDurationMs: 0,
    threadCountPeak: 0,
    providerSwitches: 0,
    recoveryEvents: 0,
    savepointCount: 0,
    exportCount: 0,
    importCount: 0,
    continuityRebuildCount: 0,
    compressionCycles: 0,
  };
}

function emptyFile(): DailyDriverMetricsFile {
  const now = new Date().toISOString();
  return {
    version: DAILY_DRIVER_METRICS_VERSION,
    updatedAt: now,
    totals: emptyTotals(),
    sessions: [],
    currentSession: null,
  };
}

export function getDailyDriverMetricsPath(): string {
  return path.join(app.getPath("userData"), DAILY_DRIVER_METRICS_FILENAME);
}

export function readDailyDriverMetrics(): DailyDriverMetricsFile {
  const filePath = getDailyDriverMetricsPath();
  if (!fs.existsSync(filePath)) {
    return emptyFile();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as DailyDriverMetricsFile;
    if (parsed.version !== DAILY_DRIVER_METRICS_VERSION || !parsed.totals) {
      return emptyFile();
    }
    return parsed;
  } catch {
    return emptyFile();
  }
}

export function writeDailyDriverMetrics(data: DailyDriverMetricsFile): void {
  const filePath = getDailyDriverMetricsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function mutate(mutator: (data: DailyDriverMetricsFile) => void): DailyDriverMetricsFile {
  const data = readDailyDriverMetrics();
  mutator(data);
  writeDailyDriverMetrics(data);
  return data;
}

export function recordAppLaunch(): DailyDriverMetricsFile {
  return mutate((data) => {
    data.totals.appLaunches += 1;
    const sessionId = uuid();
    const startedAt = new Date().toISOString();
    data.currentSession = { id: sessionId, startedAt };
    data.sessions.push({
      id: sessionId,
      startedAt,
      endedAt: null,
      durationMs: 0,
    });
    if (data.sessions.length > 120) {
      data.sessions = data.sessions.slice(-120);
    }
  });
}

export function endCurrentSession(): void {
  mutate((data) => {
    if (!data.currentSession) return;
    const endedAt = new Date().toISOString();
    const session = data.sessions.find((s) => s.id === data.currentSession?.id);
    if (session) {
      session.endedAt = endedAt;
      const durationMs = Math.max(
        0,
        new Date(endedAt).getTime() - new Date(session.startedAt).getTime(),
      );
      session.durationMs = durationMs;
      data.totals.sessionDurationMs += durationMs;
    }
    data.currentSession = null;
  });
}

export function recordThreadCount(count: number): void {
  if (count <= 0) return;
  mutate((data) => {
    if (count > data.totals.threadCountPeak) {
      data.totals.threadCountPeak = count;
    }
  });
}

export function recordProviderSwitch(): void {
  mutate((data) => {
    data.totals.providerSwitches += 1;
  });
}

export function recordRecoveryEvent(): void {
  mutate((data) => {
    data.totals.recoveryEvents += 1;
  });
}

export function recordSavepoint(): void {
  mutate((data) => {
    data.totals.savepointCount += 1;
  });
}

export function recordExport(): void {
  mutate((data) => {
    data.totals.exportCount += 1;
  });
}

export function recordImport(): void {
  mutate((data) => {
    data.totals.importCount += 1;
  });
}

export function recordContinuityRebuild(): void {
  mutate((data) => {
    data.totals.continuityRebuildCount += 1;
  });
}

export function recordCompressionCycle(): void {
  mutate((data) => {
    data.totals.compressionCycles += 1;
  });
}
