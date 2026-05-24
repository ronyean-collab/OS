import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { buildVerifiedBackupBundle } from "../electron/main/services/workspace-export";
import {
  decryptBackupBundle,
  encryptBackupBundle,
} from "../electron/main/services/encrypted-export";
import { verifyWorkspaceExport } from "../electron/main/services/export-verification";

describe("encrypted export", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("roundtrips encrypted backup with password", () => {
    const db = session();
    const ws = createWorkspace(db, "Encrypt WS");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Secret history" });

    const verify = verifyWorkspaceExport(db, ws.id);
    expect(verify.ok).toBe(true);

    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const encrypted = encryptBackupBundle(bundle, "test-password-123");
    expect(encrypted.ok).toBe(true);

    const decrypted = decryptBackupBundle(encrypted.json!, "test-password-123");
    expect(decrypted.ok).toBe(true);
    expect(decrypted.bundle?.manifest.workspaceId).toBe(ws.id);
    expect(decrypted.bundle?.payload.messages[0].content).toBe("Secret history");
  });

  it("fails deterministically on wrong password", () => {
    const db = session();
    const ws = createWorkspace(db, "Wrong pass");
    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const encrypted = encryptBackupBundle(bundle, "correct-password-99");
    expect(encrypted.ok).toBe(true);

    const bad = decryptBackupBundle(encrypted.json!, "wrong-password-99");
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/password/i);
  });

  it("rejects short passwords before encryption", () => {
    const db = session();
    const ws = createWorkspace(db, "Short");
    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const result = encryptBackupBundle(bundle, "short");
    expect(result.ok).toBe(false);
  });

  it("never embeds password in exported package metadata", () => {
    const db = session();
    const ws = createWorkspace(db, "Meta");
    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const password = "my-local-password-123";
    const encrypted = encryptBackupBundle(bundle, password);
    expect(encrypted.ok).toBe(true);
    expect(encrypted.json).not.toContain(password);
  });
});
