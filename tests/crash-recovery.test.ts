import { describe, expect, it, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  clearCrashLogsForTests,
  getPreviousSessionCrashSummary,
  logCrash,
  markSessionCleanExit,
  markSessionStart,
  readCrashLogSummary,
  setCrashLogDirForTests,
} from "../electron/main/services/crash-logger";
import {
  buildDiagnosticsBundle,
  serializeDiagnosticsBundle,
} from "../electron/main/services/diagnostics-bundle";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  setAuditDirForTests,
  clearAuditLogForTests,
} from "../electron/main/services/reliability-audit";

describe("crash recovery and diagnostics safety", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setCrashLogDirForTests(null);
    clearCrashLogsForTests();
    setAuditDirForTests(null);
    clearAuditLogForTests();
  });

  function crashDir() {
    const dir = path.join(os.tmpdir(), `crash-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setCrashLogDirForTests(dir);
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  it("records crash and reports previous session unexpectedly closed", () => {
    crashDir();
    markSessionStart();
    logCrash({ process: "main", error: new Error("boom") });

    const summary = getPreviousSessionCrashSummary(true);
    expect(summary.previousSessionCrashed).toBe(true);
    expect(summary.message).toContain("unexpectedly");
    expect(summary.recoverySnapshotPreserved).toBe(true);

    const logs = readCrashLogSummary(5);
    expect(logs.length).toBe(1);
    expect(logs[0].process).toBe("main");
  });

  it("clears crash flag after clean exit", () => {
    crashDir();
    markSessionStart();
    logCrash({ process: "renderer", error: new Error("renderer fail") });
    markSessionCleanExit();
    markSessionStart();

    const summary = getPreviousSessionCrashSummary(false);
    expect(summary.previousSessionCrashed).toBe(false);
    expect(readCrashLogSummary(5).length).toBe(1);
  });

  it("diagnostics export excludes secret patterns", () => {
    const dir = path.join(os.tmpdir(), `diag-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setAuditDirForTests(dir);
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));

    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    const ws = createWorkspace(s.db, "Diag safe");

    const bundle = buildDiagnosticsBundle(s.db, ws.id);
    const json = serializeDiagnosticsBundle(bundle);
    expect(json).not.toMatch(/sk-[a-zA-Z0-9_-]{12,}/);
    expect(json).not.toContain("apiKey");
    expect(bundle.workspaces[0].name).toBe("Diag safe");
    expect(bundle.systemHealth.migrationHealth.status).toBe("healthy");
  });
});
