import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
  setActiveThread,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildWorkspaceExportPackage,
  parseExportPackageJson,
  serializeExportPackage,
  validateWorkspaceForExport,
} from "../electron/main/services/workspace-export";
import { insertOrphanMessageRow } from "./helpers/corrupt-db";
import { APP_VERSION, SCHEMA_VERSION } from "../src/shared/app-version";

describe("workspace export", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("exports deterministic ordered package with metadata", () => {
    const db = session();
    const ws = createWorkspace(db, "Export Lab");
    const t1 = createThread(db, ws.id, "Alpha");
    const t2 = createThread(db, ws.id, "Beta");

    insertMessage(db, {
      threadId: t1.id,
      role: "user",
      content: "First",
    });
    insertMessage(db, {
      threadId: t2.id,
      role: "user",
      content: "Second",
    });

    const pkg = buildWorkspaceExportPackage(db, ws.id);
    expect(pkg.verification.ok).toBe(true);
    const bundle = JSON.parse(serializeExportPackage(pkg)) as {
      backupFormatVersion: number;
      manifest: { replayHash: string; integritySignaturePlaceholder: string };
      metadata: { format: string };
      payload: { workspace: { id: string } };
    };
    expect(bundle.backupFormatVersion).toBe(2);
    expect(bundle.manifest.replayHash).toMatch(/^replay-/);
    expect(bundle.manifest.integritySignaturePlaceholder).toMatch(/^sig-placeholder-/);
    expect(bundle.metadata.format).toBe("continuity-backup-metadata");
    expect(bundle.payload.workspace.id).toBe(ws.id);
    expect(pkg.schemaVersion).toBe(SCHEMA_VERSION);
    expect(pkg.appVersion).toBe(APP_VERSION);
    expect(pkg.buildNumber).toBeTruthy();
    expect(pkg.workspace.id).toBe(ws.id);
    for (let i = 1; i < pkg.threads.length; i++) {
      expect(
        pkg.threads[i].createdAt.localeCompare(pkg.threads[i - 1].createdAt),
      ).toBeGreaterThanOrEqual(0);
    }

    const messageIds = pkg.messages.map((m) => m.id);
    const sortedIds = [...pkg.messages]
      .sort((a, b) => {
        const t = a.createdAt.localeCompare(b.createdAt);
        return t !== 0 ? t : a.id.localeCompare(b.id);
      })
      .map((m) => m.id);
    expect(messageIds).toEqual(sortedIds);

    const json = serializeExportPackage(pkg);
    const parsed = parseExportPackageJson(json);
    expect(parsed.messages[0]?.rawProviderPayload).toBeDefined();
  });

  it("refuses export build when verification fails", () => {
    const db = session();
    const ws = createWorkspace(db, "Bad export");
    insertOrphanMessageRow(db, { id: "orphan", threadId: "no-thread", content: "x" });

    expect(() => buildWorkspaceExportPackage(db, ws.id)).toThrow(
      /Export validation failed|Export blocked/,
    );
  });

  it("fails validation when workspace missing", () => {
    const db = session();
    const result = validateWorkspaceForExport(db, "missing-ws");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("workspace-not-found");
  });

  it("preserves raw provider payloads in export", () => {
    const db = session();
    const ws = createWorkspace(db, "Payload WS");
    const thread = createThread(db, ws.id, "Chat");
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Hi",
      provider: "openai",
      model: "gpt-4o-mini",
      rawProviderPayload: { tokens: 42, mock: true },
    });

    const pkg = buildWorkspaceExportPackage(db, ws.id);
    const assistant = pkg.messages.find((m) => m.role === "assistant");
    expect(assistant?.rawProviderPayload).toContain("tokens");
  });
});
