import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import { getVersionStamp } from "../../../src/shared/app-version";

let snapshotDirOverride: string | null = null;
let recoveryLogDirOverride: string | null = null;

export function setRecoveryPathsForTests(
  snapshotDir: string | null,
  logDir: string | null = null,
): void {
  snapshotDirOverride = snapshotDir;
  recoveryLogDirOverride = logDir;
}

export type RecoverySnapshotMeta = {
  id: string;
  reason: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  releaseChannel: string;
  buildDate: string;
  dbPath: string;
  filePath: string;
  byteSize: number;
};

function userDataRoot(): string {
  if (snapshotDirOverride) {
    return path.dirname(snapshotDirOverride);
  }
  try {
    return app.getPath("userData");
  } catch {
    return path.join(os.tmpdir(), "continuity-desktop-test");
  }
}

function snapshotsDir(): string {
  const dir =
    snapshotDirOverride ??
    path.join(userDataRoot(), "recovery-snapshots");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Atomic copy: write to .tmp then rename. */
export function createRecoverySnapshot(
  dbPath: string,
  reason: string,
): RecoverySnapshotMeta | null {
  if (!fs.existsSync(dbPath)) return null;

  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = snapshotsDir();
  const finalPath = path.join(dir, `continuity-${id}.db`);
  const tmpPath = `${finalPath}.tmp`;

  try {
    fs.copyFileSync(dbPath, tmpPath);
    fs.renameSync(tmpPath, finalPath);
    const stat = fs.statSync(finalPath);
    const version = getVersionStamp();
    const meta: RecoverySnapshotMeta = {
      id,
      reason,
      createdAt: new Date().toISOString(),
      appVersion: version.appVersion,
      schemaVersion: version.schemaVersion,
      buildNumber: version.buildNumber,
      releaseChannel: version.releaseChannel,
      buildDate: version.buildDate,
      dbPath,
      filePath: finalPath,
      byteSize: stat.size,
    };
    fs.writeFileSync(`${finalPath}.meta.json`, JSON.stringify(meta, null, 2), "utf8");
    return meta;
  } catch {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

export function validateRecoverySnapshot(filePath: string): {
  valid: boolean;
  reason?: string;
  meta?: RecoverySnapshotMeta;
} {
  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: "Snapshot file missing." };
  }
  const stat = fs.statSync(filePath);
  if (stat.size < 512) {
    return { valid: false, reason: "Snapshot file too small." };
  }
  const metaPath = `${filePath}.meta.json`;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(
        fs.readFileSync(metaPath, "utf8"),
      ) as RecoverySnapshotMeta;
      return { valid: true, meta };
    } catch {
      return { valid: false, reason: "Snapshot metadata unreadable." };
    }
  }
  return { valid: true };
}

export function appendRecoveryLog(line: string): void {
  const logPath = path.join(
    recoveryLogDirOverride ?? userDataRoot(),
    "recovery.log",
  );
  const entry = `[${new Date().toISOString()}] ${line}\n`;
  fs.appendFileSync(logPath, entry, "utf8");
}
