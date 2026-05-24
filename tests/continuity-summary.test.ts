import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
  getWorkspaceById,
  updateContinuitySummary,
} from "../electron/main/services/workspace-service";
import {
  assembleProviderContext,
  MAX_CONTINUITY_SUMMARY_CHARS,
} from "../electron/main/services/context-assembly";
import {
  buildWorkspaceExportPackage,
  parseExportPackageJson,
  serializeExportPackage,
} from "../electron/main/services/workspace-export";
import { executeWorkspaceImport } from "../electron/main/services/workspace-import";
import { insertMessage, listMessages } from "../electron/main/services/message-service";
import {
  captureWorkspaceCheckpoint,
  parseCheckpointPayload,
} from "../electron/main/services/snapshot-checkpoint";
import { createManualSnapshot } from "../electron/main/services/snapshot-service";
import { executeSnapshotRestore } from "../electron/main/services/restore-service";
import type { Message } from "../src/shared/types";

describe("continuity summary", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s;
  }

  function msg(id: string, role: Message["role"], content: string): Message {
    return {
      id,
      threadId: "th-1",
      role,
      content,
      provider: null,
      model: null,
      rawProviderPayload: null,
      messageStatus: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("persists and reloads continuity summary on workspace", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Summary WS");
    expect(ws.continuitySummary).toBeNull();

    const updated = updateContinuitySummary(
      db,
      ws.id,
      "  Ship v1 with SQLite backups.  ",
    );
    expect(updated.continuitySummary).toBe("Ship v1 with SQLite backups.");

    const reloaded = getWorkspaceById(db, ws.id);
    expect(reloaded?.continuitySummary).toBe("Ship v1 with SQLite backups.");

    const events = db
      .prepare(
        "SELECT event_type FROM timeline_events WHERE workspace_id = ? AND event_type = ?",
      )
      .all(ws.id, "continuity_summary_updated") as Array<{ event_type: string }>;
    expect(events.length).toBe(1);
  });

  it("bounds stored summary length", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Bound");
    const long = "x".repeat(MAX_CONTINUITY_SUMMARY_CHARS + 500);
    const updated = updateContinuitySummary(db, ws.id, long);
    expect(updated.continuitySummary?.length).toBe(MAX_CONTINUITY_SUMMARY_CHARS);
  });

  it("includes summary in provider context when present", () => {
    const messages = [msg("1", "user", "Latest question")];
    const { messages: ctx } = assembleProviderContext({
      workspaceName: "Alpha Project",
      continuitySummary: "Use Postgres locally only.",
      messages,
    });
    expect(ctx[0].role).toBe("system");
    expect(ctx[0].content).toContain("Project: Alpha Project");
    expect(ctx[0].content).toContain("Use Postgres locally only.");
    expect(ctx[1].content).toBe("Latest question");
  });

  it("omits summary block when empty but keeps project identity", () => {
    const messages = [msg("1", "user", "Hi")];
    const { messages: ctx } = assembleProviderContext({
      workspaceName: "Empty summary",
      continuitySummary: "   ",
      messages,
    });
    expect(ctx).toHaveLength(2);
    expect(ctx[0].role).toBe("system");
    expect(ctx[0].content).toBe("Project: Empty summary");
    expect(ctx[0].content).not.toContain("Continuity summary");
    expect(ctx[1].role).toBe("user");
  });

  it("does not delete canonical messages when summary is saved", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Messages intact");
    const thread = createThread(db, ws.id, "Chat");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Keep me" });
    updateContinuitySummary(db, ws.id, "Project notes");
    const messages = listMessages(db, thread.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Keep me");
  });

  it("exports and imports continuity summary with workspace", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Export summary");
    updateContinuitySummary(db, ws.id, "Imported context should survive.");
    const thread = createThread(db, ws.id, "T1");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Hi" });

    const pkg = buildWorkspaceExportPackage(db, ws.id);
    expect(pkg.workspace.continuitySummary).toBe("Imported context should survive.");

    const json = serializeExportPackage(pkg);
    const result = executeWorkspaceImport(db, json);
    expect(result.ok).toBe(true);
    expect(result.workspace?.continuitySummary).toBe("Imported context should survive.");

    const threadRow = db
      .prepare("SELECT id FROM threads WHERE workspace_id = ? LIMIT 1")
      .get(result.workspaceId!) as { id: string };
    const importedMessages = listMessages(db, threadRow.id);
    expect(importedMessages.some((m) => m.content === "Hi")).toBe(true);
  });

  it("captures continuity summary in workspace snapshots", () => {
    const { db, dbPath } = session();
    const ws = createWorkspace(db, "Snap summary");
    updateContinuitySummary(db, ws.id, "Snapshot-held context");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Before snap" });

    const snap = createManualSnapshot(db, ws.id, { label: "With summary" });
    const checkpoint = parseCheckpointPayload(snap.payloadJson);
    expect(checkpoint?.continuitySummary).toBe("Snapshot-held context");

    updateContinuitySummary(db, ws.id, "Changed after snapshot");
    insertMessage(db, { threadId: thread.id, role: "user", content: "After snap" });

    const restore = executeSnapshotRestore(db, snap.id, ws.id, { dbPath });
    expect(restore.ok).toBe(true);
    expect(getWorkspaceById(db, ws.id)?.continuitySummary).toBe("Snapshot-held context");

    const messages = listMessages(db, thread.id);
    expect(messages.some((m) => m.content === "Before snap")).toBe(true);
    expect(messages.some((m) => m.content === "After snap")).toBe(false);
  });

  it("checkpoint capture reads summary from database", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Checkpoint");
    updateContinuitySummary(db, ws.id, "Checkpoint text");
    const checkpoint = captureWorkspaceCheckpoint(db, ws.id);
    expect(checkpoint.continuitySummary).toBe("Checkpoint text");
    expect(checkpoint.workspaceName).toBe("Checkpoint");
  });

  it("roundtrips export parse for continuity summary", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Parse");
    updateContinuitySummary(db, ws.id, "Parse me");
    const pkg = buildWorkspaceExportPackage(db, ws.id);
    const parsed = parseExportPackageJson(serializeExportPackage(pkg));
    expect(parsed.workspace.continuitySummary).toBe("Parse me");
  });
});
