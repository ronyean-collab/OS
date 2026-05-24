/**
 * Secure credential storage — API keys/tokens never belong in SQLite plaintext.
 */

export type SecureStorageErrorCode =
  | "encryption_unavailable"
  | "encrypt_failed"
  | "decrypt_failed"
  | "write_failed"
  | "verify_failed"
  | "app_not_ready"
  | "invalid_secret";

export type SecureStorageSetResult =
  | { ok: true }
  | { ok: false; code: SecureStorageErrorCode; message: string };

export type SecureStorageDiagnostics = {
  adapterName: string;
  secureStorageAvailable: boolean;
  encryptionAvailable: boolean;
  secretsDirectory: string | null;
  lastError: string | null;
};

export interface SecureStorageAdapter {
  readonly name: string;
  isAvailable(): boolean;
  hasKey(ref: string): boolean;
  setKey(ref: string, secret: string): SecureStorageSetResult;
  getKey(ref: string): string | null;
  deleteKey(ref: string): void;
  buildRef(workspaceId: string, provider: string): string;
  getDiagnostics(): SecureStorageDiagnostics;
}
