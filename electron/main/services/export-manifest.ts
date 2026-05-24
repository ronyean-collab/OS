import { fnv1a64Hex } from "./replay-hash";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";
import type { WorkspaceExportPackage } from "./workspace-export";

export const BACKUP_FORMAT_VERSION = 2;

export type ExportManifest = {
  backupFormatVersion: number;
  exportId: string;
  exportedAt: string;
  workspaceId: string;
  workspaceName: string;
  releaseChannel: string;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  buildDate: string;
  messageCount: number;
  threadCount: number;
  snapshotCount: number;
  timelineEventCount: number;
  replayHash: string;
  checksumPlaceholder: string;
  /** Integrity signature placeholder — not a cryptographic guarantee. */
  integritySignaturePlaceholder: string;
};

export type ExportMetadataFile = {
  format: "continuity-backup-metadata";
  version: number;
  manifest: ExportManifest;
  verificationOk: boolean;
  verificationErrors: string[];
  verificationWarnings: string[];
  canonicalOrdering: "messages:createdAt,id;threads:createdAt,id;timeline:createdAt,id";
};

export type WorkspaceBackupBundle = {
  backupFormatVersion: number;
  manifest: ExportManifest;
  metadata: ExportMetadataFile;
  payload: WorkspaceExportPackage;
};

export function buildExportManifest(
  pkg: WorkspaceExportPackage,
  exportId: string,
): ExportManifest {
  const channel = getReleaseChannelInfo({
    releaseChannel: pkg.releaseChannel as "dev" | "beta" | "stable",
    appVersion: pkg.appVersion,
    schemaVersion: pkg.schemaVersion,
    buildNumber: pkg.buildNumber,
    buildDate: pkg.buildDate,
  });

  const canonical = JSON.stringify({
    workspaceId: pkg.workspace.id,
    messages: pkg.messages.map((m) => m.id),
    snapshots: pkg.snapshots.map((s) => s.id),
  });
  const checksumPlaceholder = `backup-${fnv1a64Hex(canonical)}`;

  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    exportId,
    exportedAt: pkg.exportedAt,
    workspaceId: pkg.workspace.id,
    workspaceName: pkg.workspace.name,
    releaseChannel: channel.releaseChannel,
    appVersion: pkg.appVersion,
    schemaVersion: pkg.schemaVersion,
    buildNumber: pkg.buildNumber,
    buildDate: pkg.buildDate,
    messageCount: pkg.messages.length,
    threadCount: pkg.threads.length,
    snapshotCount: pkg.snapshots.length,
    timelineEventCount: pkg.timelineEvents.length,
    replayHash: pkg.verification.replayHash,
    checksumPlaceholder,
    integritySignaturePlaceholder: `sig-placeholder-${fnv1a64Hex(`${checksumPlaceholder}:${pkg.verification.replayHash}`)}`,
  };
}

export function buildExportMetadataFile(
  manifest: ExportManifest,
  pkg: WorkspaceExportPackage,
): ExportMetadataFile {
  return {
    format: "continuity-backup-metadata",
    version: BACKUP_FORMAT_VERSION,
    manifest,
    verificationOk: pkg.verification.ok,
    verificationErrors: pkg.verification.errors,
    verificationWarnings: pkg.verification.warnings,
    canonicalOrdering:
      "messages:createdAt,id;threads:createdAt,id;timeline:createdAt,id",
  };
}

export function buildWorkspaceBackupBundle(
  pkg: WorkspaceExportPackage,
  exportId?: string,
): WorkspaceBackupBundle {
  const id = exportId ?? `export-${Date.now()}`;
  const manifest = buildExportManifest(pkg, id);
  const metadata = buildExportMetadataFile(manifest, pkg);
  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    manifest,
    metadata,
    payload: pkg,
  };
}

export function serializeBackupBundle(bundle: WorkspaceBackupBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Ensures import/export always has array fields (never undefined). */
export function normalizeWorkspaceExportPackage(
  pkg: WorkspaceExportPackage,
): WorkspaceExportPackage {
  return {
    ...pkg,
    threads: Array.isArray(pkg.threads) ? pkg.threads : [],
    messages: Array.isArray(pkg.messages) ? pkg.messages : [],
    timelineEvents: Array.isArray(pkg.timelineEvents) ? pkg.timelineEvents : [],
    snapshots: Array.isArray(pkg.snapshots) ? pkg.snapshots : [],
  };
}

function isWorkspaceExportPayload(candidate: unknown): candidate is WorkspaceExportPackage {
  if (!candidate || typeof candidate !== "object") return false;
  const pkg = candidate as WorkspaceExportPackage;
  return Boolean(pkg.workspace) && Array.isArray(pkg.messages);
}

/** Accepts legacy flat export (v1/v2) or signed backup bundle wrapper. */
/** Reads build/version fields from a serialized backup (flat package or bundle wrapper). */
export function readExportVersionFieldsFromSerialized(json: string): {
  buildNumber?: string;
  appVersion?: string;
  schemaVersion?: number;
} {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const manifest =
      raw.manifest && typeof raw.manifest === "object"
        ? (raw.manifest as Record<string, unknown>)
        : null;
    const payload =
      raw.payload && typeof raw.payload === "object"
        ? (raw.payload as Record<string, unknown>)
        : raw;
    return {
      buildNumber:
        (payload.buildNumber as string | undefined) ??
        (manifest?.buildNumber as string | undefined),
      appVersion:
        (payload.appVersion as string | undefined) ??
        (manifest?.appVersion as string | undefined),
      schemaVersion:
        (payload.schemaVersion as number | undefined) ??
        (manifest?.schemaVersion as number | undefined),
    };
  } catch {
    return {};
  }
}

export function unwrapWorkspaceExportPayload(raw: unknown): WorkspaceExportPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload;
    if (isWorkspaceExportPayload(payload)) {
      return normalizeWorkspaceExportPackage(payload);
    }
  }

  if (isWorkspaceExportPayload(raw)) {
    return normalizeWorkspaceExportPackage(raw);
  }

  return null;
}
