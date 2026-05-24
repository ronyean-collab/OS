import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { WorkspaceBackupBundle } from "./export-manifest";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";

export const ENCRYPTED_BACKUP_FORMAT_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export type EncryptedBackupPackage = {
  encryptedBackupFormatVersion: number;
  algorithm: typeof ALGORITHM;
  kdf: "scrypt";
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
  createdAt: string;
  metadata: {
    workspaceId: string;
    workspaceName: string;
    releaseChannel: string;
    appVersion: string;
    schemaVersion: number;
    backupFormatVersion: number;
    manifestChecksum: string;
    replayHash: string;
  };
};

export type EncryptBackupResult =
  | { ok: true; package: EncryptedBackupPackage; json: string }
  | { ok: false; error: string };

export type DecryptBackupResult =
  | { ok: true; bundle: WorkspaceBackupBundle }
  | { ok: false; error: string };

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

export function encryptBackupBundle(
  bundle: WorkspaceBackupBundle,
  password: string,
): EncryptBackupResult {
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  try {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = deriveKey(password, salt);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify(bundle);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const channel = getReleaseChannelInfo();

    const pkg: EncryptedBackupPackage = {
      encryptedBackupFormatVersion: ENCRYPTED_BACKUP_FORMAT_VERSION,
      algorithm: ALGORITHM,
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      ciphertext: encrypted.toString("base64"),
      authTag: authTag.toString("base64"),
      createdAt: new Date().toISOString(),
      metadata: {
        workspaceId: bundle.manifest.workspaceId,
        workspaceName: bundle.manifest.workspaceName,
        releaseChannel: channel.releaseChannel,
        appVersion: bundle.manifest.appVersion,
        schemaVersion: bundle.manifest.schemaVersion,
        backupFormatVersion: bundle.backupFormatVersion,
        manifestChecksum: bundle.manifest.checksumPlaceholder,
        replayHash: bundle.manifest.replayHash,
      },
    };

    return { ok: true, package: pkg, json: JSON.stringify(pkg, null, 2) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Encryption failed.",
    };
  }
}

export function decryptBackupBundle(
  json: string,
  password: string,
): DecryptBackupResult {
  if (!password) {
    return { ok: false, error: "Password is required." };
  }

  let parsed: EncryptedBackupPackage;
  try {
    parsed = JSON.parse(json) as EncryptedBackupPackage;
  } catch {
    return { ok: false, error: "Invalid encrypted backup file." };
  }

  if (parsed.encryptedBackupFormatVersion !== ENCRYPTED_BACKUP_FORMAT_VERSION) {
    return { ok: false, error: "Unsupported encrypted backup format version." };
  }

  if (parsed.algorithm !== ALGORITHM) {
    return { ok: false, error: "Unsupported encryption algorithm." };
  }

  try {
    const salt = Buffer.from(parsed.salt, "base64");
    const iv = Buffer.from(parsed.iv, "base64");
    const ciphertext = Buffer.from(parsed.ciphertext, "base64");
    const authTag = Buffer.from(parsed.authTag, "base64");
    const key = deriveKey(password, salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const bundle = JSON.parse(decrypted.toString("utf8")) as WorkspaceBackupBundle;
    if (!bundle.manifest || !bundle.payload) {
      return { ok: false, error: "Decrypted backup is missing manifest or payload." };
    }
    return { ok: true, bundle };
  } catch {
    return { ok: false, error: "Decryption failed. Check your password." };
  }
}
