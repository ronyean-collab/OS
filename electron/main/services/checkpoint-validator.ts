import type { SnapshotCheckpointPayload } from "./snapshot-checkpoint";
import type { SnapshotRecord } from "./snapshot-service";
import type { WorkspaceExportPackage } from "./workspace-export";
import { unwrapWorkspaceExportPayload } from "./export-manifest";

const VALID_STATUSES = new Set([
  "streaming",
  "completed",
  "interrupted",
  "cancelled",
  "failed",
]);

const VALID_ROLES = new Set(["user", "assistant", "system"]);

export type CheckpointValidationReport = {
  valid: boolean;
  warnings: string[];
  errors: string[];
  repairRecommendations: string[];
};

export function validateCheckpointPayload(
  checkpoint: SnapshotCheckpointPayload,
  snapshot: SnapshotRecord,
): CheckpointValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const repairRecommendations: string[] = [];

  if (checkpoint.workspaceId !== snapshot.workspaceId) {
    errors.push("workspace-id-mismatch");
  }

  const threadIds = new Set(checkpoint.threads.map((t) => t.id));
  const messageIds = new Set<string>();

  for (const m of checkpoint.messages) {
    if (!threadIds.has(m.threadId)) {
      errors.push(`orphaned-message:${m.id}`);
    }
    if (messageIds.has(m.id)) {
      errors.push(`duplicate-message-id:${m.id}`);
    }
    messageIds.add(m.id);

    if (!VALID_ROLES.has(m.role)) {
      errors.push(`invalid-role:${m.id}`);
    }
    if (!VALID_STATUSES.has(m.messageStatus)) {
      warnings.push(`invalid-status:${m.id}`);
    }
    if (Number.isNaN(new Date(m.createdAt).getTime())) {
      warnings.push(`invalid-timestamp:${m.id}`);
    }
    if (m.rawProviderPayload != null) {
      try {
        JSON.parse(m.rawProviderPayload);
      } catch {
        warnings.push(`malformed-provider-payload:${m.id}`);
      }
    }
  }

  for (const threadId of threadIds) {
    const threadMessages = checkpoint.messages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let last = 0;
    for (const m of threadMessages) {
      const t = new Date(m.createdAt).getTime();
      if (!Number.isNaN(t) && t < last) {
        errors.push(`non-chronological:${threadId}:${m.id}`);
      }
      last = t;
    }
  }

  if (snapshot.threadId && checkpoint.scope === "thread") {
    const inCheckpoint = checkpoint.threads.some((t) => t.id === snapshot.threadId);
    if (!inCheckpoint) {
      errors.push("snapshot-thread-not-in-checkpoint");
    }
  }

  if (errors.length > 0) {
    repairRecommendations.push(
      "Do not restore until checkpoint errors are reviewed. Export workspace first.",
    );
  } else if (warnings.length > 0) {
    repairRecommendations.push(
      "Review warnings before restore. Canonical history may still be recoverable.",
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairRecommendations,
  };
}

export function validateImportPackageStructure(
  raw: unknown,
): CheckpointValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const repairRecommendations: string[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      warnings,
      errors: ["invalid-json-root"],
      repairRecommendations: ["File is not a valid export package."],
    };
  }

  const unwrapped = unwrapWorkspaceExportPayload(raw);
  if (!unwrapped) {
    errors.push("unsupported-export-format");
    return {
      valid: false,
      warnings,
      errors,
      repairRecommendations: ["File is not a recognized Continuity backup."],
    };
  }

  const pkg = unwrapped as unknown as Record<string, unknown>;
  const formatVersion = Number(pkg.exportFormatVersion ?? 0);
  if (formatVersion !== 1 && formatVersion !== 2) {
    errors.push("unsupported-export-format");
  }
  if (!pkg.workspace || typeof pkg.workspace !== "object") {
    errors.push("missing-workspace");
  }
  if (!Array.isArray(pkg.threads)) errors.push("missing-threads");
  if (!Array.isArray(pkg.messages)) errors.push("missing-messages");

  const verification =
    pkg.verification && typeof pkg.verification === "object"
      ? (pkg.verification as Record<string, unknown>)
      : null;
  if (verification && verification.ok === false) {
    errors.push("verification-failed");
  }

  const messages = (pkg.messages ?? []) as Array<Record<string, unknown>>;
  const threadIds = new Set(
    ((pkg.threads ?? []) as Array<Record<string, unknown>>).map((t) =>
      String(t.id),
    ),
  );
  const seenMsg = new Set<string>();
  for (const m of messages) {
    const id = String(m.id ?? "");
    if (!id) {
      errors.push("duplicate-or-empty-message-id:empty");
      continue;
    }
    if (seenMsg.has(id)) {
      errors.push(`duplicate-message-id:${id}`);
    }
    seenMsg.add(id);
    const threadId = String(m.threadId ?? "");
    if (threadId && !threadIds.has(threadId)) {
      warnings.push(`message-orphan-thread:${id}`);
    }
  }

  if (errors.length > 0) {
    repairRecommendations.push("Fix export package or re-export from a healthy workspace.");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairRecommendations,
  };
}

export function validateExportPackage(
  pkg: WorkspaceExportPackage,
): CheckpointValidationReport {
  return validateImportPackageStructure(pkg);
}
