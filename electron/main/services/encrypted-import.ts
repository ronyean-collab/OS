import type Database from "better-sqlite3";
import { decryptBackupBundle } from "./encrypted-export";
import {
  normalizeWorkspaceExportPackage,
  serializeBackupBundle,
  type WorkspaceBackupBundle,
} from "./export-manifest";
import {
  buildImportPreview,
  executeWorkspaceImport,
  type ImportExecutionResult,
  type ImportPreview,
} from "./workspace-import";
import {
  validateImportPackageStructure,
  type CheckpointValidationReport,
} from "./checkpoint-validator";
import {
  computeDeterministicReplayHash,
  messagesToReplayHashInput,
} from "./replay-hash";
import { appendAuditEvent } from "./reliability-audit";

export type EncryptedImportPreviewResult = {
  ok: boolean;
  error: string | null;
  wrongPassword: boolean;
  preview: ImportPreview | null;
  workspaceNameHint: string | null;
  /** Safe validation codes for tests/dev (never includes secrets). */
  validationErrors?: string[];
  validationWarnings?: string[];
};

export type EncryptedImportResult = ImportExecutionResult & {
  wrongPassword?: boolean;
};

function validateWorkspaceBackupBundle(
  bundle: WorkspaceBackupBundle,
): CheckpointValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const repairRecommendations: string[] = [];

  if (!bundle?.manifest || typeof bundle.manifest !== "object") {
    errors.push("missing-manifest");
  }
  if (!bundle?.metadata || typeof bundle.metadata !== "object") {
    errors.push("missing-metadata");
  }
  if (!bundle?.payload?.workspace) {
    errors.push("missing-payload");
    return {
      valid: false,
      warnings,
      errors,
      repairRecommendations: ["Decrypted backup is missing a valid payload."],
    };
  }

  const manifest = bundle.manifest;
  const payload = normalizeWorkspaceExportPackage(bundle.payload);
  const embeddedManifest = bundle.metadata?.manifest;

  const requiredArrays = [
    ["threads", payload.threads],
    ["messages", payload.messages],
    ["timelineEvents", payload.timelineEvents],
    ["snapshots", payload.snapshots],
  ] as const;
  for (const [name, value] of requiredArrays) {
    if (!Array.isArray(value)) {
      errors.push(`payload-missing-array:${name}`);
    }
  }

  if (manifest.messageCount !== payload.messages.length) {
    errors.push("manifest-message-count-mismatch");
  }
  if (manifest.threadCount !== payload.threads.length) {
    errors.push("manifest-thread-count-mismatch");
  }
  if (manifest.snapshotCount !== payload.snapshots.length) {
    errors.push("manifest-snapshot-count-mismatch");
  }
  if (manifest.timelineEventCount !== payload.timelineEvents.length) {
    errors.push("manifest-timeline-count-mismatch");
  }

  if (embeddedManifest && typeof embeddedManifest === "object") {
    if (embeddedManifest.messageCount !== payload.messages.length) {
      errors.push("metadata-manifest-message-count-mismatch");
    }
    if (embeddedManifest.threadCount !== payload.threads.length) {
      errors.push("metadata-manifest-thread-count-mismatch");
    }
    if (embeddedManifest.snapshotCount !== payload.snapshots.length) {
      errors.push("metadata-manifest-snapshot-count-mismatch");
    }
    if (embeddedManifest.timelineEventCount !== payload.timelineEvents.length) {
      errors.push("metadata-manifest-timeline-count-mismatch");
    }
    if (
      embeddedManifest.messageCount !== manifest.messageCount ||
      embeddedManifest.threadCount !== manifest.threadCount ||
      embeddedManifest.replayHash !== manifest.replayHash
    ) {
      errors.push("manifest-metadata-mismatch");
    }
  }

  const recomputedReplayHash = computeDeterministicReplayHash(
    messagesToReplayHashInput(payload.messages),
  );
  const expectsReplayIntegrity =
    manifest.messageCount > 0 ||
    payload.messages.length > 0 ||
    Boolean(manifest.replayHash);
  if (expectsReplayIntegrity && recomputedReplayHash !== manifest.replayHash) {
    errors.push("manifest-replay-hash-mismatch");
  }
  if (
    payload.verification?.replayHash != null &&
    recomputedReplayHash !== payload.verification.replayHash
  ) {
    errors.push("payload-replay-hash-mismatch");
  }

  if (bundle.metadata.verificationOk === false) {
    errors.push("metadata-verification-failed");
  }
  if (payload.verification?.ok === false) {
    errors.push("payload-verification-failed");
  }

  const payloadReport = validateImportPackageStructure(bundle);
  warnings.push(...payloadReport.warnings);
  errors.push(...payloadReport.errors);
  repairRecommendations.push(...payloadReport.repairRecommendations);

  if (errors.length > 0 && repairRecommendations.length === 0) {
    repairRecommendations.push("Fix export package or re-export from a healthy workspace.");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairRecommendations,
  };
}

function isEncryptedBackupJson(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return (
      parsed.encryptedBackupFormatVersion != null &&
      parsed.ciphertext != null &&
      parsed.algorithm != null
    );
  } catch {
    return false;
  }
}

function attachEncryptedPreview(
  preview: ImportPreview,
  bundle: WorkspaceBackupBundle,
): ImportPreview {
  return {
    ...preview,
    encrypted: true,
    workspaceName:
      preview.workspaceName ||
      bundle.manifest.workspaceName ||
      bundle.payload.workspace?.name ||
      "Unknown workspace",
  };
}

function validationFailurePreview(
  bundle: WorkspaceBackupBundle,
  validation: ReturnType<typeof validateWorkspaceBackupBundle>,
): ImportPreview {
  const base = buildImportPreview(bundle);
  return {
    ...base,
    valid: false,
    errors: [...base.errors, ...validation.errors],
    warnings: [...base.warnings, ...validation.warnings],
    encrypted: true,
  };
}

export function previewEncryptedImport(
  json: string,
  password: string,
): EncryptedImportPreviewResult {
  appendAuditEvent({
    type: "encrypted_import_attempt",
    message: "Encrypted import preview requested",
    details: { phase: "preview" },
  });

  if (!isEncryptedBackupJson(json)) {
    return {
      ok: false,
      error: "This file does not look like a Continuity encrypted backup.",
      wrongPassword: false,
      preview: null,
      workspaceNameHint: null,
      validationErrors: ["invalid-encrypted-backup-format"],
    };
  }

  const decrypted = decryptBackupBundle(json, password);
  if (!decrypted.ok) {
    const wrongPassword = decrypted.error.toLowerCase().includes("password");
    appendAuditEvent({
      type: "encrypted_import_failed",
      message: decrypted.error,
      details: { phase: "decrypt", wrongPassword },
    });
    return {
      ok: false,
      error: wrongPassword
        ? "That password did not unlock this backup. Nothing was imported."
        : decrypted.error,
      wrongPassword,
      preview: null,
      workspaceNameHint: null,
      validationErrors: wrongPassword ? ["wrong-password"] : ["decrypt-failed"],
    };
  }

  const bundle = decrypted.bundle;
  const bundleValidation = validateWorkspaceBackupBundle(bundle);
  const preview = attachEncryptedPreview(buildImportPreview(bundle), bundle);

  if (!bundleValidation.valid || !preview.valid) {
    const mismatch =
      bundleValidation.errors.some((e) =>
        e.includes("manifest") && e.includes("mismatch"),
      ) || bundleValidation.errors.includes("manifest-metadata-mismatch");
    appendAuditEvent({
      type: "encrypted_import_failed",
      message: "Decrypted backup failed validation",
      details: {
        errors: [...bundleValidation.errors, ...preview.errors],
        phase: "bundle-validation",
      },
    });
    return {
      ok: false,
      error: mismatch
        ? "Decrypted backup payload does not match its manifest. Nothing was imported."
        : "Decrypted backup could not be validated. Nothing was imported.",
      wrongPassword: false,
      preview: validationFailurePreview(bundle, bundleValidation),
      workspaceNameHint: bundle.manifest.workspaceName,
      validationErrors: [...bundleValidation.errors, ...preview.errors],
      validationWarnings: [...bundleValidation.warnings, ...preview.warnings],
    };
  }

  return {
    ok: true,
    error: null,
    wrongPassword: false,
    preview: { ...preview, valid: true },
    workspaceNameHint: bundle.manifest.workspaceName,
  };
}

export function executeEncryptedImport(
  db: Database.Database,
  json: string,
  password: string,
): EncryptedImportResult {
  appendAuditEvent({
    type: "encrypted_import_attempt",
    message: "Encrypted import started",
    details: { phase: "execute" },
  });

  const previewResult = previewEncryptedImport(json, password);
  if (!previewResult.ok || !previewResult.preview?.valid) {
    return {
      ok: false,
      message:
        previewResult.error ??
        "Encrypted import could not proceed. Nothing was changed.",
      wrongPassword: previewResult.wrongPassword,
      validationErrors: previewResult.validationErrors,
      validationWarnings: previewResult.validationWarnings,
    };
  }

  const decrypted = decryptBackupBundle(json, password);
  if (!decrypted.ok) {
    return {
      ok: false,
      message: decrypted.error,
      wrongPassword: decrypted.error.toLowerCase().includes("password"),
      validationErrors: ["decrypt-failed"],
    };
  }

  const importJson = serializeBackupBundle(decrypted.bundle);
  const result = executeWorkspaceImport(db, importJson);

  if (result.ok) {
    appendAuditEvent({
      type: "encrypted_import_completed",
      workspaceId: result.workspaceId ?? null,
      message: "Encrypted workspace import completed",
      details: {
        workspaceName: decrypted.bundle.manifest.workspaceName,
      },
    });
  } else {
    appendAuditEvent({
      type: "encrypted_import_failed",
      message: result.message,
      details: {
        phase: "import-transaction",
        validationErrors: result.validationErrors,
      },
    });
  }

  return result;
}

export function bundleToImportJson(bundle: WorkspaceBackupBundle): string {
  return serializeBackupBundle(bundle);
}
