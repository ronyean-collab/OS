import { ipcMain, shell } from "electron";
import { IPC } from "../../../src/shared/ipc-channels";
import type { AppState } from "../../../src/shared/types";
import {
  getLastMigrationApplied,
  getRecoveryMessage,
  getReliabilityState,
  getStartupCompatibilityReport,
  getStartupCrashSummary,
  isRecoveryMode,
  openDatabase,
} from "../database/connection";
import {
  getThreadMessageCount,
  listMessages,
  listMessagesPage,
} from "../services/message-service";
import {
  getProviderConfig,
  getSecureStorageDiagnostics,
  removeProviderApiKey,
  saveProviderConfig,
} from "../services/provider-service";
import { testProviderConnection } from "../services/provider-connection-test";
import { secureStorage } from "../secure-storage";
import { getSessionPlaceholder, signInPlaceholder } from "../supabase/client";
import {
  createThread,
  createWorkspace,
  getActiveThreadId,
  getActiveWorkspaceId,
  listThreads,
  listWorkspaces,
  renameThread,
  setActiveThread,
  setActiveWorkspace,
} from "../services/workspace-service";
import {
  archiveThreadAndRepair,
  moveThreadDown,
  moveThreadUp,
  repairActiveThread,
  restoreDeletedThread,
  softDeleteThreadAndRepair,
  unarchiveThread,
} from "../services/thread-management-service";
import { cancelStream, startAssistantStream } from "../services/stream-runtime";
import {
  buildOrphanRepairPreview,
  executeAttachOrphansToRecoveredThread,
  executeQuarantineOrphanedMessages,
} from "../services/orphan-repair";
import {
  assertNonEmptyString,
  assertSendMessageInput,
  assertStreamId,
  assertThreadId,
} from "./validate";
import {
  createManualSnapshot,
  getSnapshotRestoreInfo,
  listSnapshots,
  validateSnapshotForRestore,
} from "../services/snapshot-service";
import { parseCheckpointPayload } from "../services/snapshot-checkpoint";
import { executeSnapshotRestore } from "../services/restore-service";
import {
  buildImportPreview,
  executeWorkspaceImport,
} from "../services/workspace-import";
import {
  groupTimelineEvents,
  listTimelineEvents,
} from "../services/timeline-service";
import {
  buildVerifiedBackupBundle,
  buildWorkspaceExportPackage,
  serializeBackupBundleExport,
} from "../services/workspace-export";
import { encryptBackupBundle } from "../services/encrypted-export";
import { verifyWorkspaceExport } from "../services/export-verification";
import { scanWorkspaceHealth } from "../services/workspace-health";
import { getAutosaveStatus } from "../services/autosave-scheduler";
import { validateWorkspaceReplay } from "../services/replay-validator";
import { getLastSuccessfulPersistence } from "../services/reliability-metrics";
import { getLastSnapshotTime } from "../services/snapshot-service";
import { getAppVersionInfo } from "../../../src/shared/app-version";
import { getAppliedVersion } from "../database/migrations";
import {
  buildDiagnosticsReport,
  formatDiagnosticsForCopy,
  recordExportMetadata,
} from "../services/diagnostics-service";
import {
  buildDiagnosticsBundle,
  formatDiagnosticsBundleForCopy,
  serializeDiagnosticsBundle,
} from "../services/diagnostics-bundle";
import { logCrash } from "../services/crash-logger";
import {
  executeEncryptedImport,
  previewEncryptedImport,
} from "../services/encrypted-import";
import { buildRestorePreview } from "../services/restore-preview";
import { dryRunMigrations } from "../services/migration-dry-run";
import { getUpdateReadiness } from "../services/update-readiness";
import {
  dismissBackupReminder,
  getBackupReminderStatus,
  recordBackupReminderShown,
} from "../services/backup-reminder";

function requireDb() {
  const opened = openDatabase();
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.db;
}

function buildAppState(): AppState {
  const reliability = getReliabilityState();
  const version = getAppVersionInfo();
  const base = {
    interruptedResponsesRecovered: reliability.interruptedResponsesRecovered,
    sqliteRepairAttempted: reliability.sqliteRepairAttempted,
    sqliteIntegrityRestored: reliability.sqliteIntegrityRestored,
    reliabilityMessage: reliability.reliabilityMessage,
    lastSnapshotAt: null as string | null,
    lastSuccessfulPersistenceAt: null as string | null,
    version,
    appliedMigrationVersion: 0,
    migrationsJustApplied: [],
    previousSessionCrashed: false,
    downgradeDetected: false,
    startupWarnings: [],
  };

  const crash = getStartupCrashSummary();
  const compat = getStartupCompatibilityReport();

  if (isRecoveryMode()) {
    return {
      recoveryMode: true,
      recoveryMessage: getRecoveryMessage(),
      activeWorkspaceId: null,
      activeThreadId: null,
      dbReady: false,
      continuityHealthy: false,
      migrationsJustApplied: getLastMigrationApplied(),
      previousSessionCrashed: crash?.previousSessionCrashed ?? false,
      downgradeDetected: compat?.downgradeDetected ?? false,
      startupWarnings: compat?.warnings ?? [],
      ...base,
    };
  }
  try {
    const db = requireDb();
    const workspaceId = getActiveWorkspaceId(db);

    return {
      recoveryMode: false,
      recoveryMessage: null,
      activeWorkspaceId: workspaceId,
      activeThreadId: getActiveThreadId(db),
      dbReady: true,
      continuityHealthy: reliability.continuityHealthy,
      lastSnapshotAt: workspaceId
        ? getLastSnapshotTime(db, workspaceId)
        : null,
      lastSuccessfulPersistenceAt: getLastSuccessfulPersistence(db),
      version,
      appliedMigrationVersion: getAppliedVersion(db),
      migrationsJustApplied: getLastMigrationApplied(),
      previousSessionCrashed: crash?.previousSessionCrashed ?? false,
      downgradeDetected: compat?.downgradeDetected ?? false,
      startupWarnings: compat?.warnings ?? [],
    };
  } catch (err) {
    return {
      recoveryMode: true,
      recoveryMessage: err instanceof Error ? err.message : "Database unavailable",
      activeWorkspaceId: null,
      activeThreadId: null,
      dbReady: false,
      continuityHealthy: false,
      interruptedResponsesRecovered: 0,
      sqliteRepairAttempted: false,
      sqliteIntegrityRestored: false,
      reliabilityMessage: null,
      lastSnapshotAt: null,
      lastSuccessfulPersistenceAt: null,
      version,
      appliedMigrationVersion: 0,
      migrationsJustApplied: getLastMigrationApplied(),
      previousSessionCrashed: crash?.previousSessionCrashed ?? false,
      downgradeDetected: compat?.downgradeDetected ?? false,
      startupWarnings: compat?.warnings ?? [],
    };
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.APP_GET_STATE, () => buildAppState());

  ipcMain.handle(IPC.APP_GET_VERSION, () => getAppVersionInfo());

  ipcMain.handle(IPC.APP_REPORT_RENDERER_CRASH, (_e, payload: unknown) => {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : "Renderer error";
    const stack =
      payload && typeof payload === "object" && "stack" in payload
        ? String((payload as { stack: unknown }).stack)
        : null;
    logCrash({
      process: "renderer",
      error: Object.assign(new Error(message), { stack }),
      context: { source: "renderer-ipc" },
    });
    return true;
  });

  ipcMain.handle(IPC.DIAGNOSTICS_GET, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const wsId =
      typeof workspaceId === "string" && workspaceId.trim()
        ? workspaceId.trim()
        : getActiveWorkspaceId(db);
    return buildDiagnosticsReport(db, wsId);
  });

  ipcMain.handle(IPC.DIAGNOSTICS_COPY, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const wsId =
      typeof workspaceId === "string" && workspaceId.trim()
        ? workspaceId.trim()
        : getActiveWorkspaceId(db);
    const report = buildDiagnosticsReport(db, wsId);
    return formatDiagnosticsForCopy(report);
  });

  ipcMain.handle(IPC.DIAGNOSTICS_EXPORT, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const wsId =
      typeof workspaceId === "string" && workspaceId.trim()
        ? workspaceId.trim()
        : getActiveWorkspaceId(db);
    const bundle = buildDiagnosticsBundle(db, wsId);
    return { ok: true, json: serializeDiagnosticsBundle(bundle) };
  });

  ipcMain.handle(IPC.DIAGNOSTICS_BUNDLE_COPY, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const wsId =
      typeof workspaceId === "string" && workspaceId.trim()
        ? workspaceId.trim()
        : getActiveWorkspaceId(db);
    const bundle = buildDiagnosticsBundle(db, wsId);
    return formatDiagnosticsBundleForCopy(bundle);
  });

  ipcMain.handle(IPC.APP_SET_RECOVERY_MODE, (_e, enabled: boolean) => {
    void enabled;
    return buildAppState();
  });

  ipcMain.handle(IPC.WORKSPACE_LIST, () => {
    const db = requireDb();
    return listWorkspaces(db);
  });

  ipcMain.handle(IPC.WORKSPACE_CREATE, (_e, name: string) => {
    const db = requireDb();
    return createWorkspace(db, assertNonEmptyString(name, "name"));
  });

  ipcMain.handle(IPC.WORKSPACE_GET_ACTIVE, () => {
    const db = requireDb();
    const id = getActiveWorkspaceId(db);
    if (!id) return null;
    return listWorkspaces(db).find((w) => w.id === id) ?? null;
  });

  ipcMain.handle(IPC.WORKSPACE_SET_ACTIVE, (_e, workspaceId: string) => {
    const db = requireDb();
    setActiveWorkspace(db, assertNonEmptyString(workspaceId, "workspaceId"));
    return buildAppState();
  });

  ipcMain.handle(IPC.WORKSPACE_EXPORT, (_e, workspaceId: string) => {
    try {
      const db = requireDb();
      const id = assertNonEmptyString(workspaceId, "workspaceId");
      const verification = verifyWorkspaceExport(db, id);
      if (!verification.ok) {
        return {
          ok: false,
          error: `Export blocked: ${verification.errors.join(", ")}`,
          verification,
          exportWarnings: verification.warnings,
        };
      }
      const pkg = buildWorkspaceExportPackage(db, id);
      const bundle = buildVerifiedBackupBundle(db, id);
      recordExportMetadata(db);
      return {
        ok: true,
        json: serializeBackupBundleExport(bundle),
        verification: pkg.verification,
        exportWarnings: pkg.verification.warnings,
        manifestChecksum: bundle.manifest.checksumPlaceholder,
        integritySignaturePlaceholder: bundle.manifest.integritySignaturePlaceholder,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Export failed",
      };
    }
  });

  ipcMain.handle(
    IPC.WORKSPACE_EXPORT_ENCRYPTED,
    (_e, workspaceId: string, password: unknown) => {
      try {
        const db = requireDb();
        const id = assertNonEmptyString(workspaceId, "workspaceId");
        if (typeof password !== "string") {
          return { ok: false, error: "Password is required." };
        }
        const verification = verifyWorkspaceExport(db, id);
        if (!verification.ok) {
          return {
            ok: false,
            error: `Export blocked: ${verification.errors.join(", ")}`,
          };
        }
        const bundle = buildVerifiedBackupBundle(db, id);
        const encrypted = encryptBackupBundle(bundle, password);
        if (!encrypted.ok) {
          return { ok: false, error: encrypted.error };
        }
        recordExportMetadata(db);
        return { ok: true, json: encrypted.json };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Encrypted export failed",
        };
      }
    },
  );

  ipcMain.handle(IPC.WORKSPACE_HEALTH, (_e, workspaceId: string) => {
    const db = requireDb();
    const id = assertNonEmptyString(workspaceId, "workspaceId");
    return scanWorkspaceHealth(db, id);
  });

  ipcMain.handle(IPC.AUTOSAVE_STATUS, () => {
    const db = requireDb();
    return getAutosaveStatus(db);
  });

  ipcMain.handle(
    IPC.THREAD_LIST,
    (_e, workspaceId: unknown, options: unknown) => {
      const db = requireDb();
      const opts =
        options && typeof options === "object"
          ? (options as { includeArchived?: boolean; includeDeleted?: boolean })
          : {};
      return listThreads(db, assertNonEmptyString(workspaceId, "workspaceId"), {
        includeArchived: Boolean(opts.includeArchived),
        includeDeleted: Boolean(opts.includeDeleted),
      });
    },
  );

  ipcMain.handle(IPC.THREAD_CREATE, (_e, workspaceId: string, title: string) => {
    const db = requireDb();
    return createThread(
      db,
      assertNonEmptyString(workspaceId, "workspaceId"),
      assertNonEmptyString(title, "title"),
    );
  });

  ipcMain.handle(IPC.THREAD_RENAME, (_e, threadId: string, title: string) => {
    const db = requireDb();
    return renameThread(
      db,
      assertThreadId(threadId),
      assertNonEmptyString(title, "title"),
    );
  });

  ipcMain.handle(IPC.THREAD_MOVE_UP, (_e, threadId: unknown) => {
    const db = requireDb();
    return moveThreadUp(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.THREAD_MOVE_DOWN, (_e, threadId: unknown) => {
    const db = requireDb();
    return moveThreadDown(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.THREAD_ARCHIVE, (_e, threadId: unknown) => {
    const db = requireDb();
    return archiveThreadAndRepair(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.THREAD_UNARCHIVE, (_e, threadId: unknown) => {
    const db = requireDb();
    return unarchiveThread(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.THREAD_DELETE, (_e, threadId: unknown) => {
    const db = requireDb();
    return softDeleteThreadAndRepair(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.THREAD_RESTORE, (_e, threadId: unknown) => {
    const db = requireDb();
    return restoreDeletedThread(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.THREAD_REPAIR_ACTIVE, (_e, workspaceId: unknown) => {
    const db = requireDb();
    return repairActiveThread(db, assertNonEmptyString(workspaceId, "workspaceId"));
  });

  ipcMain.handle(IPC.MESSAGE_LIST, (_e, threadId: string) => {
    const db = requireDb();
    return listMessages(db, assertThreadId(threadId));
  });

  ipcMain.handle(
    IPC.MESSAGE_LIST_PAGE,
    (
      _e,
      threadId: string,
      options?: {
        limit?: number;
        beforeCreatedAt?: string | null;
        beforeId?: string | null;
      },
    ) => {
      const db = requireDb();
      return listMessagesPage(db, assertThreadId(threadId), options);
    },
  );

  ipcMain.handle(IPC.MESSAGE_COUNT, (_e, threadId: string) => {
    const db = requireDb();
    return getThreadMessageCount(db, assertThreadId(threadId));
  });

  ipcMain.handle(IPC.MESSAGE_SEND, async (event, input: unknown) => {
    const db = requireDb();
    const parsed = assertSendMessageInput(input);
    const result = await startAssistantStream(db, event.sender, parsed);
    return {
      message: result.userMessage,
      assistantPlaceholder: result.assistantMessage,
    };
  });

  ipcMain.handle(IPC.MESSAGE_STREAM_START, async (event, input: unknown) => {
    const db = requireDb();
    const parsed = assertSendMessageInput(input);
    return startAssistantStream(db, event.sender, parsed);
  });

  ipcMain.handle(IPC.MESSAGE_STREAM_CANCEL, (event, streamId: unknown) => {
    const db = requireDb();
    return cancelStream(db, assertStreamId(streamId), event.sender);
  });

  ipcMain.handle(IPC.TIMELINE_LIST, (_e, workspaceId: string) => {
    const db = requireDb();
    return listTimelineEvents(db, assertNonEmptyString(workspaceId, "workspaceId"));
  });

  ipcMain.handle(IPC.TIMELINE_LIST_GROUPED, (_e, workspaceId: string) => {
    const db = requireDb();
    const events = listTimelineEvents(
      db,
      assertNonEmptyString(workspaceId, "workspaceId"),
    );
    return groupTimelineEvents(events);
  });

  ipcMain.handle(IPC.SNAPSHOT_LIST, (_e, workspaceId: string) => {
    const db = requireDb();
    const wsId = assertNonEmptyString(workspaceId, "workspaceId");
    return listSnapshots(db, wsId).map((snap) => {
      const info = getSnapshotRestoreInfo(snap);
      return {
        ...snap,
        lastRestoredAt: info.lastRestoredAt,
        restoreStatus: info.restoreStatus,
        hasCheckpoint: Boolean(parseCheckpointPayload(snap.payloadJson)),
      };
    });
  });

  ipcMain.handle(
    IPC.SNAPSHOT_CREATE,
    (_e, workspaceId: string, label: unknown, threadId: unknown) => {
      const db = requireDb();
      return createManualSnapshot(
        db,
        assertNonEmptyString(workspaceId, "workspaceId"),
        {
          label: typeof label === "string" ? label : undefined,
          threadId: typeof threadId === "string" ? threadId : null,
        },
      );
    },
  );

  ipcMain.handle(
    IPC.SNAPSHOT_VALIDATE_RESTORE,
    (_e, snapshotId: string, workspaceId: string) => {
      const db = requireDb();
      return validateSnapshotForRestore(
        db,
        assertNonEmptyString(snapshotId, "snapshotId"),
        assertNonEmptyString(workspaceId, "workspaceId"),
      );
    },
  );

  ipcMain.handle(
    IPC.SNAPSHOT_RESTORE,
    (_e, snapshotId: string, workspaceId: string) => {
      const db = requireDb();
      return executeSnapshotRestore(
        db,
        assertNonEmptyString(snapshotId, "snapshotId"),
        assertNonEmptyString(workspaceId, "workspaceId"),
      );
    },
  );

  ipcMain.handle(IPC.WORKSPACE_IMPORT_PREVIEW, (_e, json: unknown) => {
    if (typeof json !== "string") {
      return buildImportPreview(null);
    }
    try {
      return buildImportPreview(JSON.parse(json) as unknown);
    } catch {
      return buildImportPreview(null);
    }
  });

  ipcMain.handle(IPC.WORKSPACE_IMPORT, (_e, json: unknown) => {
    const db = requireDb();
    if (typeof json !== "string") {
      return { ok: false, message: "Invalid import file." };
    }
    return executeWorkspaceImport(db, json);
  });

  ipcMain.handle(
    IPC.WORKSPACE_IMPORT_ENCRYPTED_PREVIEW,
    (_e, json: unknown, password: unknown) => {
      if (typeof json !== "string" || typeof password !== "string") {
        return {
          ok: false,
          error: "Invalid encrypted import request.",
          wrongPassword: false,
          preview: null,
          workspaceNameHint: null,
        };
      }
      return previewEncryptedImport(json, password);
    },
  );

  ipcMain.handle(
    IPC.WORKSPACE_IMPORT_ENCRYPTED,
    (_e, json: unknown, password: unknown) => {
      const db = requireDb();
      if (typeof json !== "string" || typeof password !== "string") {
        return { ok: false, message: "Invalid encrypted import request." };
      }
      return executeEncryptedImport(db, json, password);
    },
  );

  ipcMain.handle(
    IPC.SNAPSHOT_RESTORE_PREVIEW,
    (_e, snapshotId: string, workspaceId: string) => {
      const db = requireDb();
      return buildRestorePreview(
        db,
        assertNonEmptyString(snapshotId, "snapshotId"),
        assertNonEmptyString(workspaceId, "workspaceId"),
      );
    },
  );

  ipcMain.handle(IPC.MIGRATION_DRY_RUN, () => {
    const opened = openDatabase();
    if (!opened.ok) {
      throw new Error(opened.error);
    }
    return dryRunMigrations(opened.db, opened.dbPath);
  });

  ipcMain.handle(IPC.UPDATE_READINESS, () => {
    const opened = openDatabase();
    if (!opened.ok) {
      throw new Error(opened.error);
    }
    return getUpdateReadiness(opened.db, opened.dbPath);
  });

  ipcMain.handle(IPC.BACKUP_REMINDER_STATUS, () => {
    const db = requireDb();
    return getBackupReminderStatus(db);
  });

  ipcMain.handle(IPC.BACKUP_REMINDER_SHOWN, () => {
    const db = requireDb();
    recordBackupReminderShown(db);
    return true;
  });

  ipcMain.handle(IPC.BACKUP_REMINDER_DISMISS, () => {
    const db = requireDb();
    dismissBackupReminder(db);
    return true;
  });

  ipcMain.handle(IPC.REPLAY_VALIDATE, (_e, workspaceId: string) => {
    const db = requireDb();
    return validateWorkspaceReplay(
      db,
      assertNonEmptyString(workspaceId, "workspaceId"),
    );
  });

  ipcMain.handle(IPC.PROVIDER_GET_CONFIG, (_e, workspaceId: string) => {
    const db = requireDb();
    return getProviderConfig(db, assertNonEmptyString(workspaceId, "workspaceId"));
  });

  ipcMain.handle(
    IPC.PROVIDER_SAVE_CONFIG,
    (
      _e,
      workspaceId: unknown,
      provider: unknown,
      model: unknown,
      apiKey: unknown,
      baseUrl: unknown,
    ) => {
      const db = requireDb();
      if (typeof apiKey !== "string") {
        throw new Error("Invalid apiKey.");
      }
      return saveProviderConfig(
        db,
        assertNonEmptyString(workspaceId, "workspaceId"),
        assertNonEmptyString(provider, "provider"),
        assertNonEmptyString(model, "model"),
        apiKey,
        typeof baseUrl === "string" ? baseUrl : null,
      );
    },
  );

  ipcMain.handle(
    IPC.PROVIDER_TEST_CONNECTION,
    async (_e, workspaceId: unknown, payload: unknown) => {
      const db = requireDb();
      const wsId = assertNonEmptyString(workspaceId, "workspaceId");
      const options =
        payload && typeof payload === "object"
          ? (payload as {
              apiKey?: string;
              provider?: string;
              model?: string;
              baseUrl?: string;
            })
          : {};
      return testProviderConnection(db, wsId, {
        apiKey: typeof options.apiKey === "string" ? options.apiKey : undefined,
        provider: typeof options.provider === "string" ? options.provider : undefined,
        model: typeof options.model === "string" ? options.model : undefined,
        baseUrl: typeof options.baseUrl === "string" ? options.baseUrl : undefined,
      });
    },
  );

  ipcMain.handle(
    IPC.PROVIDER_REMOVE_KEY,
    (_e, workspaceId: unknown, provider: unknown) => {
      const db = requireDb();
      removeProviderApiKey(
        db,
        assertNonEmptyString(workspaceId, "workspaceId"),
        assertNonEmptyString(provider, "provider"),
      );
      return getProviderConfig(db, assertNonEmptyString(workspaceId, "workspaceId"));
    },
  );

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_e, url: unknown) => {
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error("Only https URLs can be opened.");
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle(IPC.SECURE_HAS_KEY, (_e, ref: unknown) => {
    return typeof ref === "string" && secureStorage.hasKey(ref);
  });

  ipcMain.handle(IPC.SECURE_SET_KEY, (_e, ref: unknown, secret: unknown) => {
    if (typeof ref !== "string" || typeof secret !== "string") {
      throw new Error("Invalid secure storage arguments.");
    }
    return secureStorage.setKey(ref, secret).ok;
  });

  ipcMain.handle(IPC.SECURE_STORAGE_DIAGNOSTICS, () =>
    getSecureStorageDiagnostics(),
  );

  ipcMain.handle(IPC.SECURE_DELETE_KEY, (_e, ref: unknown) => {
    if (typeof ref === "string") {
      secureStorage.deleteKey(ref);
    }
    return true;
  });

  ipcMain.handle(IPC.AUTH_GET_SESSION, () => getSessionPlaceholder());

  ipcMain.handle(IPC.AUTH_SIGN_IN_PLACEHOLDER, (_e, email: unknown) =>
    signInPlaceholder(typeof email === "string" ? email : ""),
  );

  ipcMain.handle(IPC.THREAD_SET_ACTIVE, (_e, threadId: string) => {
    const db = requireDb();
    setActiveThread(db, assertThreadId(threadId));
    return buildAppState();
  });

  ipcMain.handle(IPC.ORPHAN_REPAIR_PREVIEW, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const ws =
      typeof workspaceId === "string" && workspaceId.trim()
        ? workspaceId.trim()
        : getActiveWorkspaceId(db);
    return buildOrphanRepairPreview(db, ws);
  });

  ipcMain.handle(IPC.ORPHAN_REPAIR_ATTACH, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const ws = assertNonEmptyString(
      typeof workspaceId === "string" ? workspaceId : getActiveWorkspaceId(db) ?? "",
      "workspaceId",
    );
    return executeAttachOrphansToRecoveredThread(db, ws);
  });

  ipcMain.handle(IPC.ORPHAN_REPAIR_QUARANTINE, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const ws =
      typeof workspaceId === "string" && workspaceId.trim()
        ? workspaceId.trim()
        : getActiveWorkspaceId(db);
    return executeQuarantineOrphanedMessages(db, ws);
  });
}
