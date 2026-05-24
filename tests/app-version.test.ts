import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  APP_NAME,
  APP_VERSION,
  BUILD_NUMBER,
  SCHEMA_VERSION,
  getAppVersionInfo,
  getVersionStamp,
} from "../src/shared/app-version";
import { createManualSnapshot } from "../electron/main/services/snapshot-service";
import {
  buildWorkspaceExportPackage,
  parseExportPackageJson,
  serializeExportPackage,
} from "../electron/main/services/workspace-export";
import {
  appendAuditEvent,
  clearAuditLogForTests,
  setAuditDirForTests,
} from "../electron/main/services/reliability-audit";
import {
  appendTimelineEventValidated,
} from "../electron/main/services/timeline-events";
import {
  buildDiagnosticsReport,
  formatDiagnosticsForCopy,
  recordExportMetadata,
} from "../electron/main/services/diagnostics-service";
import { createWorkspace, createThread } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { listTimelineEvents } from "../electron/main/services/timeline-service";
import fs from "fs";
import path from "path";
import os from "os";

describe("app version module", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setAuditDirForTests(null);
    clearAuditLogForTests();
  });

  function session() {
    const s = openTestDatabase();
    const dir = path.join(os.tmpdir(), `ver-audit-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setAuditDirForTests(dir);
    cleanups.push(() => {
      s.cleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    return s.db;
  }

  it("exposes centralized version info from package.json", () => {
    const info = getAppVersionInfo();
    expect(info.appName).toBe(APP_NAME);
    expect(info.appVersion).toBe(APP_VERSION);
    expect(info.buildNumber).toBe(BUILD_NUMBER);
    expect(info.schemaVersion).toBe(SCHEMA_VERSION);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("includes version metadata in workspace export", () => {
    const db = session();
    const ws = createWorkspace(db, "Export version");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Hi" });
    const pkg = buildWorkspaceExportPackage(db, ws.id);
    expect(pkg.appVersion).toBe(APP_VERSION);
    expect(pkg.schemaVersion).toBe(SCHEMA_VERSION);
    expect(pkg.buildNumber).toBe(BUILD_NUMBER);
    expect(pkg.releaseChannel).toBeTruthy();
    expect(pkg.buildDate).toBeTruthy();
    const parsed = parseExportPackageJson(serializeExportPackage(pkg));
    expect(parsed.buildNumber).toBe(BUILD_NUMBER);
  });

  it("includes version metadata in manual snapshots", () => {
    const db = session();
    const ws = createWorkspace(db, "Snap version");
    const snap = createManualSnapshot(db, ws.id, { label: "Versioned" });
    expect(snap.appVersion).toBe(APP_VERSION);
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION);
    const payload = JSON.parse(snap.payloadJson) as { capturedWith?: { appVersion: string } };
    expect(payload.capturedWith?.appVersion).toBe(APP_VERSION);
  });

  it("includes version metadata in audit log entries", () => {
    const entry = appendAuditEvent({
      type: "restore_attempt",
      message: "test audit version",
    });
    expect(entry.appVersion).toBe(APP_VERSION);
    expect(entry.schemaVersion).toBe(SCHEMA_VERSION);
    expect(entry.buildNumber).toBe(BUILD_NUMBER);
  });

  it("stores version on new timeline events while old rows remain readable", () => {
    const db = session();
    const ws = createWorkspace(db, "Timeline version");
    appendTimelineEventValidated(db, {
      workspaceId: ws.id,
      type: "message_added",
      title: "Test",
      description: "Versioned event",
    });
    const events = listTimelineEvents(db, ws.id);
    const latest = events[0];
    expect(latest.appVersion).toBe(APP_VERSION);
    expect(latest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(latest.buildNumber).toBe(BUILD_NUMBER);
  });

  it("diagnostics copy excludes credential patterns", () => {
    const db = session();
    const ws = createWorkspace(db, "Diag");
    recordExportMetadata(db);
    const report = buildDiagnosticsReport(db, ws.id);
    const text = formatDiagnosticsForCopy(report);
    expect(text).not.toMatch(/sk-[a-zA-Z0-9_-]{12,}/);
    expect(text).toContain(APP_VERSION);
    expect(getVersionStamp().appVersion).toBe(APP_VERSION);
  });
});
