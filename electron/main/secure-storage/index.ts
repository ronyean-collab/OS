import { app, safeStorage } from "electron";
import { getUserDataPath } from "../database/connection";
import { createElectronSecureStorage } from "./electron-impl";
import type { SecureStorageAdapter } from "./types";

const electronAdapter = createElectronSecureStorage({
  getUserDataPath,
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (plain) => safeStorage.encryptString(plain),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
  isAppReady: () => app.isReady(),
});

let activeAdapter: SecureStorageAdapter = electronAdapter;

/** Production secure storage (Electron safeStorage + encrypted files under userData). */
export const secureStorage: SecureStorageAdapter = {
  get name() {
    return activeAdapter.name;
  },
  isAvailable: () => activeAdapter.isAvailable(),
  hasKey: (ref) => activeAdapter.hasKey(ref),
  setKey: (ref, secret) => activeAdapter.setKey(ref, secret),
  getKey: (ref) => activeAdapter.getKey(ref),
  deleteKey: (ref) => activeAdapter.deleteKey(ref),
  buildRef: (workspaceId, provider) => activeAdapter.buildRef(workspaceId, provider),
  getDiagnostics: () => activeAdapter.getDiagnostics(),
};

/** Test-only: route secure storage through an in-memory stub. */
export function __setSecureStorageForTests(adapter: SecureStorageAdapter | null): void {
  activeAdapter = adapter ?? electronAdapter;
}

export type {
  SecureStorageAdapter,
  SecureStorageDiagnostics,
  SecureStorageSetResult,
  SecureStorageErrorCode,
} from "./types";

export { createElectronSecureStorage } from "./electron-impl";
export { MemorySecureStorageStub } from "./memory-stub";
