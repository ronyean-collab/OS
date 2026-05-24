import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { createManualSnapshot } from "../electron/main/services/snapshot-service";
import { parseCheckpointPayload } from "../electron/main/services/snapshot-checkpoint";
import {
  validateCheckpointPayload,
  validateImportPackageStructure,
} from "../electron/main/services/checkpoint-validator";
import {
  buildWorkspaceExportPackage,
  serializeExportPackage,
} from "../electron/main/services/workspace-export";
import { validateReplaySequence } from "../electron/main/services/replay-sequence";
import {
  setAuditDirForTests,
  clearAuditLogForTests,
} from "../electron/main/services/reliability-audit";
import fs from "fs";
import path from "path";
import os from "os";

describe("checkpoint validator", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setAuditDirForTests(null);
    clearAuditLogForTests();
  });

  function session() {
    const s = openTestDatabase();
    const dir = path.join(os.tmpdir(), `cp-audit-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setAuditDirForTests(dir);
    cleanups.push(() => {
      s.cleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    return s.db;
  }

  it("validates healthy checkpoint payload", () => {
    const db = session();
    const ws = createWorkspace(db, "CP");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "ok" });
    const snap = createManualSnapshot(db, ws.id);
    const checkpoint = parseCheckpointPayload(snap.payloadJson)!;

    const report = validateCheckpointPayload(checkpoint, snap);
    expect(report.valid).toBe(true);
  });

  it("detects duplicate message IDs in checkpoint", () => {
    const db = session();
    const ws = createWorkspace(db, "Dup");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "dup me" });
    const snap = createManualSnapshot(db, ws.id);
    const checkpoint = parseCheckpointPayload(snap.payloadJson)!;
    expect(checkpoint.messages.length).toBeGreaterThan(0);
    checkpoint.messages.push({ ...checkpoint.messages[0] });
    const report = validateCheckpointPayload(checkpoint, snap);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects malformed import package", () => {
    const report = validateImportPackageStructure({ foo: "bar" });
    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it("validates replay sequence ordering", () => {
    const db = session();
    const ws = createWorkspace(db, "Replay");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "a" });
    insertMessage(db, { threadId: thread.id, role: "assistant", content: "b" });

    const seq = validateReplaySequence(db, ws.id);
    expect(seq.ok).toBe(true);
    expect(seq.replayHashPlaceholder).toMatch(/^replay-/);
  });

  it("validates export package structure for import preview", () => {
    const db = session();
    const ws = createWorkspace(db, "Export");
    createThread(db, ws.id, "T");
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));
    const report = validateImportPackageStructure(JSON.parse(json));
    expect(report.valid).toBe(true);
  });
});
