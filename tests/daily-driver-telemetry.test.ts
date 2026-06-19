import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), `continuity-telemetry-${process.pid}`),
  },
}));

describe("daily driver telemetry", () => {
  beforeEach(async () => {
    const { getDailyDriverMetricsPath, readDailyDriverMetrics, writeDailyDriverMetrics } =
      await import("../electron/main/services/daily-driver-telemetry");
    const p = getDailyDriverMetricsPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    writeDailyDriverMetrics(readDailyDriverMetrics());
  });

  afterEach(async () => {
    const { getDailyDriverMetricsPath } = await import(
      "../electron/main/services/daily-driver-telemetry"
    );
    const p = getDailyDriverMetricsPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("records launches without user content", async () => {
    const telemetry = await import("../electron/main/services/daily-driver-telemetry");
    telemetry.recordAppLaunch();
    telemetry.recordExport();
    telemetry.recordImport();
    const data = telemetry.readDailyDriverMetrics();
    expect(data.totals.appLaunches).toBe(1);
    expect(data.totals.exportCount).toBe(1);
    expect(data.totals.importCount).toBe(1);
    const raw = fs.readFileSync(telemetry.getDailyDriverMetricsPath(), "utf8");
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toMatch(/sk-[a-zA-Z0-9]+/);
  });
});
