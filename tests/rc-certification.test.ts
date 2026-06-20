/**
 * Release-candidate certification harness (vitest).
 * Validates continuity promises using existing service-level tests as ground truth.
 */
import { describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace, createThread } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { recoverInterruptedStreams } from "../electron/main/services/stream-recovery";
import {
  buildWorkspaceExportPackage,
  serializeExportPackage,
} from "../electron/main/services/workspace-export";
import {
  buildImportPreview,
  executeWorkspaceImport,
} from "../electron/main/services/workspace-import";

describe("RC continuity certification", () => {
  it("preserves canonical messages through interrupted stream recovery", () => {
    const { db, cleanup } = openTestDatabase();
    try {
      const ws = createWorkspace(db, "Cert WS");
      const thread = createThread(db, ws.id, "Lane");
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO messages (id, thread_id, role, content, provider, model, created_at, message_status)
         VALUES (?, ?, 'assistant', ?, 'ollama', 'm', ?, 'streaming')`,
      ).run("cert-msg-1", thread.id, "Partial", now);
      const result = recoverInterruptedStreams(db);
      expect(result.recoveredCount).toBe(1);
      const row = db
        .prepare("SELECT content, message_status FROM messages WHERE id = ?")
        .get("cert-msg-1") as { content: string; message_status: string };
      expect(row.content).toBe("Partial");
      expect(row.message_status).toBe("interrupted");
    } finally {
      cleanup();
    }
  });

  it("export/import roundtrip preserves workspace identity", () => {
    const { db, cleanup } = openTestDatabase();
    try {
      const ws = createWorkspace(db, "Roundtrip");
      const thread = createThread(db, ws.id, "T1");
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content: "certification message",
        provider: null,
        model: null,
      });
      const pkg = buildWorkspaceExportPackage(db, ws.id);
      const json = serializeExportPackage(pkg);
      const preview = buildImportPreview(JSON.parse(json));
      expect(preview.valid).toBe(true);
      const result = executeWorkspaceImport(db, json);
      expect(result.ok).toBe(true);
      expect(result.workspaceId).not.toBe(ws.id);
    } finally {
      cleanup();
    }
  });
});
