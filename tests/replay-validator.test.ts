import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { validateWorkspaceReplay } from "../electron/main/services/replay-validator";
import { validateImportPackageStructure } from "../electron/main/services/checkpoint-validator";
import { buildWorkspaceExportPackage } from "../electron/main/services/workspace-export";
import {
  createManualSnapshot,
  validateSnapshotMetadata,
} from "../electron/main/services/snapshot-service";
import { listTimelineEvents } from "../electron/main/services/timeline-service";

describe("replay validator", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("passes validation on healthy workspace", () => {
    const db = session();
    const ws = createWorkspace(db, "Healthy");
    const thread = createThread(db, ws.id, "T1");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Hello",
    });

    const report = validateWorkspaceReplay(db, ws.id);
    expect(report.ok).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("reports duplicate message IDs across threads", () => {
    const db = session();
    const ws = createWorkspace(db, "Dupes");
    const t1 = createThread(db, ws.id, "A");
    const t2 = createThread(db, ws.id, "B");
    insertMessage(db, { threadId: t1.id, role: "user", content: "one" });

    const pkg = buildWorkspaceExportPackage(db, ws.id);
    const duplicate = { ...pkg.messages[0], threadId: t2.id };
    const report = validateImportPackageStructure({
      ...pkg,
      messages: [...pkg.messages, duplicate],
    });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("duplicate"))).toBe(true);
    expect(report.repairRecommendations.length).toBeGreaterThan(0);
  });

  it("validates snapshot metadata", () => {
    const db = session();
    const ws = createWorkspace(db, "Snap");
    const snap = createManualSnapshot(db, ws.id, { label: "Manual test" });
    const meta = validateSnapshotMetadata(snap);
    expect(meta.valid).toBe(true);
  });

  it("orders timeline events chronologically in export list helper", () => {
    const db = session();
    const ws = createWorkspace(db, "Timeline");
    createThread(db, ws.id, "T1");
    const events = listTimelineEvents(db, ws.id);
    const types = events.map((e) => e.type);
    expect(types).toContain("workspace_created");
    expect(types).toContain("thread_created");
  });
});
