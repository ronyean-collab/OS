import fs from "fs";
import path from "path";
import type {
  SecureStorageDiagnostics,
  SecureStorageSetResult,
} from "./types";

const SECRETS_DIR = "secure-secrets";

export type ElectronSecureStorageDeps = {
  getUserDataPath: () => string;
  isEncryptionAvailable: () => boolean;
  encryptString: (plain: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
  isAppReady: () => boolean;
};

function sanitizeRefFileName(ref: string): string {
  // Colons are invalid in Windows file names — refs use `continuity-os:ws:provider`.
  return ref.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createElectronSecureStorage(deps: ElectronSecureStorageDeps) {
  let lastError: string | null = null;

  function setLastError(message: string): void {
    lastError = message;
    if (process.env.NODE_ENV === "development") {
      console.error("[continuity] secure storage:", message);
    }
  }

  function clearLastError(): void {
    lastError = null;
  }

  function getSecretsDirectory(): string {
    return path.join(deps.getUserDataPath(), SECRETS_DIR);
  }

  function ensureSecretsDirectory(): SecureStorageSetResult | null {
    try {
      const dir = getSecretsDirectory();
      fs.mkdirSync(dir, { recursive: true });
      return null;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create secure storage directory.";
      setLastError(`directory_create_failed: ${message}`);
      return {
        ok: false,
        code: "write_failed",
        message,
      };
    }
  }

  function secretPath(ref: string): string {
    const dir = getSecretsDirectory();
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${sanitizeRefFileName(ref)}.bin`);
  }

  function writePayloadAtomic(filePath: string, payload: Buffer): SecureStorageSetResult {
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmpPath, payload);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        /* target may not exist yet */
      }
      try {
        fs.renameSync(tmpPath, filePath);
      } catch {
        fs.copyFileSync(tmpPath, filePath);
        fs.unlinkSync(tmpPath);
      }
      return { ok: true };
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore cleanup failure */
      }
      const message = err instanceof Error ? err.message : "Secure storage write failed.";
      setLastError(`write_failed: ${message}`);
      return { ok: false, code: "write_failed", message };
    }
  }

  return {
    name: "electron-safe-storage" as const,

    isAvailable(): boolean {
      return deps.isAppReady() && deps.isEncryptionAvailable();
    },

    hasKey(ref: string): boolean {
      try {
        return fs.existsSync(secretPath(ref));
      } catch {
        return false;
      }
    },

    setKey(ref: string, secret: string): SecureStorageSetResult {
      clearLastError();

      if (!secret.trim()) {
        const message = "API key is empty.";
        setLastError(message);
        return { ok: false, code: "invalid_secret", message };
      }

      if (!deps.isAppReady()) {
        const message = "Application is not ready for secure storage.";
        setLastError(message);
        return { ok: false, code: "app_not_ready", message };
      }

      const dirError = ensureSecretsDirectory();
      if (dirError) return dirError;

      if (!deps.isEncryptionAvailable()) {
        const message =
          "OS secure storage encryption is not available on this system.";
        setLastError(message);
        return { ok: false, code: "encryption_unavailable", message };
      }

      let payload: Buffer;
      try {
        payload = deps.encryptString(secret);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not encrypt API key.";
        setLastError(`encrypt_failed: ${message}`);
        return { ok: false, code: "encrypt_failed", message };
      }

      const filePath = secretPath(ref);
      const writeResult = writePayloadAtomic(filePath, payload);
      if (!writeResult.ok) return writeResult;

      try {
        const readBack = fs.readFileSync(filePath);
        const decrypted = deps.decryptString(readBack);
        if (decrypted !== secret) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            /* ignore */
          }
          const message = "Stored API key could not be verified after write.";
          setLastError(message);
          return { ok: false, code: "verify_failed", message };
        }
      } catch (err) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
        const message =
          err instanceof Error ? err.message : "Could not verify stored API key.";
        setLastError(`verify_failed: ${message}`);
        return { ok: false, code: "verify_failed", message };
      }

      clearLastError();
      return { ok: true };
    },

    getKey(ref: string): string | null {
      const filePath = secretPath(ref);
      if (!fs.existsSync(filePath)) return null;

      if (!deps.isEncryptionAvailable()) {
        setLastError("encryption_unavailable on read");
        return null;
      }

      try {
        const buf = fs.readFileSync(filePath);
        return deps.decryptString(buf);
      } catch (err) {
        const message = err instanceof Error ? err.message : "decrypt_failed";
        setLastError(`decrypt_failed: ${message}`);
        return null;
      }
    },

    deleteKey(ref: string): void {
      try {
        const filePath = secretPath(ref);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : "delete_failed";
        setLastError(`delete_failed: ${message}`);
      }
    },

    buildRef(workspaceId: string, provider: string): string {
      return `continuity-os:${workspaceId}:${provider}`;
    },

    getDiagnostics(): SecureStorageDiagnostics {
      let secretsDirectory: string | null = null;
      try {
        if (deps.isAppReady()) {
          secretsDirectory = getSecretsDirectory();
        }
      } catch {
        secretsDirectory = null;
      }

      return {
        adapterName: "electron-safe-storage",
        secureStorageAvailable: deps.isAppReady(),
        encryptionAvailable: deps.isEncryptionAvailable(),
        secretsDirectory,
        lastError,
      };
    },
  };
}
