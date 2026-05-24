import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createElectronSecureStorage } from "../electron/main/secure-storage/electron-impl";
import { MemorySecureStorageStub } from "../electron/main/secure-storage/memory-stub";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __setSecureStorageForTests,
  getProviderConfig,
  saveProviderConfig,
} from "../electron/main/services/provider-service";
import { getProviderDefinition } from "../src/shared/provider-definitions";
import { PROVIDER_SECURE_STORAGE_ERROR } from "../src/shared/provider-errors";

const DEFAULT_MODEL = getProviderDefinition("openai").recommendedModel;

describe("secure storage", () => {
  describe("electron implementation", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-secure-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("writes encrypted payload with read-after-write verification", () => {
      const adapter = createElectronSecureStorage({
        getUserDataPath: () => tmpDir,
        isAppReady: () => true,
        isEncryptionAvailable: () => true,
        encryptString: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
        decryptString: (buf) => buf.toString("utf8").slice("enc:".length),
      });

      const ref = adapter.buildRef("ws-1", "openai");
      const result = adapter.setKey(ref, "sk-live-test-key");
      expect(result.ok).toBe(true);
      expect(adapter.hasKey(ref)).toBe(true);
      expect(adapter.getKey(ref)).toBe("sk-live-test-key");

      const diag = adapter.getDiagnostics();
      expect(diag.encryptionAvailable).toBe(true);
      expect(diag.secretsDirectory).toContain("secure-secrets");
      expect(diag.lastError).toBeNull();
    });

    it("fails when encryption is unavailable", () => {
      const adapter = createElectronSecureStorage({
        getUserDataPath: () => tmpDir,
        isAppReady: () => true,
        isEncryptionAvailable: () => false,
        encryptString: (plain) => Buffer.from(plain),
        decryptString: (buf) => buf.toString(),
      });

      const result = adapter.setKey(adapter.buildRef("ws", "openai"), "sk-x");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("encryption_unavailable");
      }
      expect(adapter.getDiagnostics().lastError).toMatch(/encryption/i);
    });

    it("rolls back file when read-after-write verification fails", () => {
      let reads = 0;
      const adapter = createElectronSecureStorage({
        getUserDataPath: () => tmpDir,
        isAppReady: () => true,
        isEncryptionAvailable: () => true,
        encryptString: (plain) => Buffer.from(plain, "utf8"),
        decryptString: () => {
          reads += 1;
          return reads === 1 ? "wrong-key" : "sk-x";
        },
      });

      const ref = adapter.buildRef("ws", "openai");
      const result = adapter.setKey(ref, "sk-x");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("verify_failed");
      expect(adapter.hasKey(ref)).toBe(false);
    });
  });

  describe("provider save integration", () => {
    const cleanups: Array<() => void> = [];
    const stub = new MemorySecureStorageStub();

    beforeEach(() => {
      __setSecureStorageForTests(stub);
    });

    afterEach(() => {
      __setSecureStorageForTests(null);
      while (cleanups.length) cleanups.pop()?.();
    });

    function session() {
      const s = openTestDatabase();
      cleanups.push(s.cleanup);
      return s.db;
    }

    it("saveProviderConfig succeeds when secure storage succeeds", () => {
      const db = session();
      const ws = createWorkspace(db, "Secure OK");
      const config = saveProviderConfig(
        db,
        ws.id,
        "openai",
        DEFAULT_MODEL,
        "sk-test-key-12345",
        null,
      );
      expect(config.hasApiKey).toBe(true);
      const row = db
        .prepare("SELECT secure_key_ref FROM provider_configs WHERE workspace_id = ?")
        .get(ws.id) as { secure_key_ref: string };
      expect(row.secure_key_ref).not.toContain("sk-test");
      expect(stub.getKey(row.secure_key_ref)).toBe("sk-test-key-12345");
    });

    it("save fails when secure storage returns error and does not insert config", () => {
      stub.setFailNextWrite(true);
      const db = session();
      const ws = createWorkspace(db, "Secure fail");
      expect(() =>
        saveProviderConfig(db, ws.id, "openai", DEFAULT_MODEL, "sk-fail", null),
      ).toThrow(PROVIDER_SECURE_STORAGE_ERROR);
      expect(getProviderConfig(db, ws.id)).toBeNull();
    });

    it("SQLite never contains raw API key", () => {
      const db = session();
      const ws = createWorkspace(db, "No plaintext");
      saveProviderConfig(db, ws.id, "openai", DEFAULT_MODEL, "sk-secret-abc", null);
      const rows = db
        .prepare(
          `SELECT secure_key_ref, model, provider FROM provider_configs WHERE workspace_id = ?`,
        )
        .all(ws.id) as Array<Record<string, string>>;
      for (const row of rows) {
        const blob = JSON.stringify(row);
        expect(blob).not.toContain("sk-secret-abc");
      }
    });
  });
});
