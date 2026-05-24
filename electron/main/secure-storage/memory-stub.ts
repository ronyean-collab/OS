import type {
  SecureStorageAdapter,
  SecureStorageDiagnostics,
  SecureStorageSetResult,
} from "./types";

/**
 * In-memory stub for unit tests and headless verification (not for production).
 */
export class MemorySecureStorageStub implements SecureStorageAdapter {
  readonly name = "memory-stub";
  private store = new Map<string, string>();
  private lastError: string | null = null;
  private forceFail = false;

  /** Test hook: next setKey call fails without storing. */
  setFailNextWrite(fail: boolean): void {
    this.forceFail = fail;
  }

  isAvailable(): boolean {
    return true;
  }

  hasKey(ref: string): boolean {
    return this.store.has(ref);
  }

  setKey(ref: string, secret: string): SecureStorageSetResult {
    this.lastError = null;
    if (this.forceFail) {
      this.forceFail = false;
      this.lastError = "simulated_write_failure";
      return { ok: false, code: "write_failed", message: "simulated_write_failure" };
    }
    if (!secret.trim()) {
      this.lastError = "empty_secret";
      return { ok: false, code: "invalid_secret", message: "API key is empty." };
    }
    this.store.set(ref, secret);
    const readBack = this.store.get(ref);
    if (readBack !== secret) {
      this.store.delete(ref);
      this.lastError = "verify_failed";
      return {
        ok: false,
        code: "verify_failed",
        message: "Stored API key could not be verified after write.",
      };
    }
    return { ok: true };
  }

  getKey(ref: string): string | null {
    return this.store.get(ref) ?? null;
  }

  deleteKey(ref: string): void {
    this.store.delete(ref);
  }

  buildRef(workspaceId: string, provider: string): string {
    return `continuity-os:${workspaceId}:${provider}`;
  }

  getDiagnostics(): SecureStorageDiagnostics {
    return {
      adapterName: this.name,
      secureStorageAvailable: true,
      encryptionAvailable: true,
      secretsDirectory: "memory://stub",
      lastError: this.lastError,
    };
  }
}
