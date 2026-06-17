import { app, ipcMain, shell } from "electron";
import { IPC } from "../../../src/shared/ipc-channels";
import type { AppState, Workspace } from "../../../src/shared/types";
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
  insertMessage,
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
import {
  bootstrapLocalAiOnStartup,
  ensureDefaultContinuityAiProvider,
} from "../services/local-ai-bootstrap";
import { resolveDefaultAiRoute } from "../services/default-ai-runtime";
import {
  getConsumerStatus,
  pauseEmbeddedLocalAiDownload,
  prepareEmbeddedLocalAiOnFirstRun,
  restartEmbeddedLocalAiDownload,
  resumeEmbeddedLocalAiDownload,
} from "../services/embedded-local-ai-manager";
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
  updateContinuitySummary,
  updateWorkspaceProfile,
  touchWorkspaceActivity,
} from "../services/workspace-service";
import {
  getAssistantProfile,
  updateAssistantProfile,
} from "../services/assistant-profile-service";
import { resetWorkspaceExperience } from "../services/first-time-experience-reset-service";
import {
  readDailyDriverMetrics,
  recordCompressionCycle,
  recordContinuityRebuild,
  recordExport,
  recordImport,
  recordProviderSwitch,
  recordRecoveryEvent,
  recordSavepoint,
  recordThreadCount,
} from "../services/daily-driver-telemetry";
import { scanWorkspaceHealth } from "../services/workspace-health";
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
  buildUniversalContextPack,
  saveManualAssistantResponse,
  saveManualExchange,
} from "../services/context-pack-service";
import {
  applyContinuityImportFile,
  listMarkdownMemoryRecords,
  listStructuredMemoryEventRecords,
  previewContinuityImportFile,
} from "../services/continuity-import-file";
import { exportMarkdownMemoryFile } from "../services/markdown-memory-service";
import { getLocalAiStatus } from "../services/local-ai-service";
import { getEmbeddedLocalLlmStatus } from "../services/embedded-local-llm-service";
import { buildMemoryCompressionDraft } from "../services/memory-compression-service";
import { getContinuityInspectorReport } from "../services/continuity-inspector";
import {
  collectRuntimeHealthInput,
  measureRuntimeHealth,
} from "../services/runtime-health-service";
import {
  buildOrphanRepairPreview,
  executeAttachOrphansToRecoveredThread,
  executeQuarantineOrphanedMessages,
} from "../services/orphan-repair";
import {
  assertContinuityImportApplyInput,
  assertContinuityImportPreviewInput,
  assertContextPackBuildInput,
  assertManualAssistantResponseSaveInput,
  assertManualExchangeSaveInput,
  assertMarkdownMemoryExportInput,
  assertNonEmptyString,
  assertSendMessageInput,
  assertStreamId,
  assertThreadId,
  assertContinuityInspectorInput,
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

function withWorkspaceHealth(
  ws: Workspace,
  status: "healthy" | "attention" | "unhealthy",
): Workspace {
  return { ...ws, continuityHealthStatus: status };
}

function requireDb() {
  const opened = openDatabase();
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.db;
}

async function resolveProviderReadiness(
  db: ReturnType<typeof requireDb>,
  workspaceId: string | null,
): Promise<
  Pick<
    AppState,
    | "providerSetupRequired"
    | "providerReady"
    | "selectedProvider"
    | "providerReadinessStatus"
    | "defaultAiRouteStatus"
    | "defaultAiRouteSource"
    | "defaultAiConsumerMessage"
    | "defaultAiCanReply"
    | "defaultAiActionLabel"
    | "defaultAiAdvancedMessage"
    | "embeddedAiPhase"
    | "embeddedAiProgressPercent"
    | "embeddedAiBytesDownloaded"
    | "embeddedAiBytesTotal"
    | "embeddedAiLastProgressAt"
    | "embeddedAiConsumerMessage"
    | "embeddedAiRepliesReady"
  >
> {
  const embedded = getConsumerStatus();
  const embeddedFields = {
    embeddedAiPhase: embedded.phase,
    embeddedAiProgressPercent: embedded.progressPercent,
    embeddedAiBytesDownloaded: embedded.bytesDownloaded,
    embeddedAiBytesTotal: embedded.bytesTotal,
    embeddedAiLastProgressAt: embedded.lastProgressAt,
    embeddedAiConsumerMessage: embedded.message,
    embeddedAiRepliesReady: embedded.aiRepliesReady,
  };

  if (!workspaceId) {
    return {
      providerSetupRequired: false,
      providerReady: false,
      selectedProvider: "ollama",
      providerReadinessStatus: "not_configured",
      defaultAiRouteStatus: "manual_mode",
      defaultAiRouteSource: "manual",
      defaultAiConsumerMessage: "Connect AI in Settings when you're ready.",
      ...embeddedFields,
    };
  }

  const route = await resolveDefaultAiRoute(db, workspaceId);
  return {
    providerSetupRequired: route.providerSetupRequired,
    providerReady: route.canReply,
    selectedProvider: route.selectedProvider,
    providerReadinessStatus: route.canReply ? "ready" : route.providerReadinessStatus,
    defaultAiRouteStatus: route.status,
    defaultAiRouteSource: route.source,
    defaultAiConsumerMessage: route.consumerMessage,
    defaultAiCanReply: route.canReply,
    defaultAiActionLabel: route.actionLabel ?? null,
    defaultAiAdvancedMessage: route.advancedMessage ?? null,
    ...embeddedFields,
    embeddedAiRepliesReady: route.canReply,
  };
}

function resolveUserDataDir(): string {
  try {
    return app.getPath("userData");
  } catch {
    return process.env.CONTINUITY_E2E_USER_DATA?.trim() || process.cwd();
  }
}

function kickoffEmbeddedLocalAiPreparation(
  db: ReturnType<typeof requireDb>,
  workspaceId: string,
): void {
  void prepareEmbeddedLocalAiOnFirstRun(db, workspaceId, resolveUserDataDir()).catch(() => {
    // Non-blocking — consumer status reflects failures.
  });
}

async function buildAppState(): Promise<AppState> {
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
      providerSetupRequired: true,
      providerReady: false,
      selectedProvider: null,
      providerReadinessStatus: "not_configured",
      runtimeHealthScore: 0,
      recoveryConfidenceScore: 0,
      ...base,
    };
  }
  try {
    const db = requireDb();
    const workspaceId = getActiveWorkspaceId(db);
    const threadId = getActiveThreadId(db);
    const providerReadiness = await resolveProviderReadiness(db, workspaceId);
    if (workspaceId) {
      kickoffEmbeddedLocalAiPreparation(db, workspaceId);
    }
    let runtimeHealthScore = 0.5;
    let recoveryConfidenceScore = 0.5;
    if (workspaceId && threadId) {
      const healthInput = collectRuntimeHealthInput(db, {
        workspaceId,
        threadId,
        activePayloadBytes: 0,
      });
      const health = measureRuntimeHealth(healthInput);
      runtimeHealthScore = health.runtimeHealthScore;
      recoveryConfidenceScore = health.recoveryConfidenceScore;
    }

    return {
      recoveryMode: false,
      recoveryMessage: null,
      activeWorkspaceId: workspaceId,
      activeThreadId: threadId,
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
      runtimeHealthScore,
      recoveryConfidenceScore,
      ...providerReadiness,
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
      providerSetupRequired: true,
      providerReady: false,
      selectedProvider: null,
      providerReadinessStatus: "network_error",
      runtimeHealthScore: 0,
      recoveryConfidenceScore: 0,
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

  ipcMain.handle(IPC.APP_SET_RECOVERY_MODE, async (_e, enabled: boolean) => {
    void enabled;
    return buildAppState();
  });

  ipcMain.handle(IPC.WORKSPACE_LIST, () => {
    const db = requireDb();
    return listWorkspaces(db);
  });

  ipcMain.handle(IPC.WORKSPACE_CREATE, (_e, name: string) => {
    const db = requireDb();
    const ws = createWorkspace(db, assertNonEmptyString(name, "name"));
    ensureDefaultContinuityAiProvider(db, ws.id);
    return ws;
  });

  ipcMain.handle(IPC.WORKSPACE_GET_ACTIVE, () => {
    const db = requireDb();
    const id = getActiveWorkspaceId(db);
    if (!id) return null;
    const ws = listWorkspaces(db).find((w) => w.id === id);
    if (!ws) return null;
    const health = scanWorkspaceHealth(db, id);
    return withWorkspaceHealth(ws, health.status);
  });

  ipcMain.handle(
    IPC.WORKSPACE_UPDATE_PROFILE,
    (_e, workspaceId: unknown, patch: unknown) => {
      const db = requireDb();
      const id = assertNonEmptyString(workspaceId, "workspaceId");
      if (!patch || typeof patch !== "object") {
        throw new Error("patch must be an object");
      }
      const p = patch as { name?: string; description?: string | null };
      const ws = updateWorkspaceProfile(db, id, {
        name: typeof p.name === "string" ? p.name : undefined,
        description: p.description !== undefined ? p.description : undefined,
      });
      const health = scanWorkspaceHealth(db, id);
      return withWorkspaceHealth(ws, health.status);
    },
  );

  ipcMain.handle(IPC.DAILY_DRIVER_METRICS_GET, () => readDailyDriverMetrics());

  ipcMain.handle(IPC.ASSISTANT_GET_PROFILE, () => {
    const db = requireDb();
    return getAssistantProfile(db);
  });

  ipcMain.handle(IPC.ASSISTANT_UPDATE_PROFILE, (_e, patch: unknown) => {
    const db = requireDb();
    if (!patch || typeof patch !== "object") {
      throw new Error("patch must be an object");
    }
    const p = patch as {
      assistantName?: string;
      webEnabled?: boolean;
      memoryEnabled?: boolean;
      continuityEnabled?: boolean;
    };
    return updateAssistantProfile(db, {
      assistantName: typeof p.assistantName === "string" ? p.assistantName : undefined,
      webEnabled: typeof p.webEnabled === "boolean" ? p.webEnabled : undefined,
      memoryEnabled: typeof p.memoryEnabled === "boolean" ? p.memoryEnabled : undefined,
      continuityEnabled:
        typeof p.continuityEnabled === "boolean" ? p.continuityEnabled : undefined,
    });
  });

  ipcMain.handle(IPC.EXPERIENCE_RESET, (_e, workspaceId: unknown) => {
    const db = requireDb();
    const id = assertNonEmptyString(workspaceId, "workspaceId");
    if (process.env.NODE_ENV === "production") {
      throw new Error("Reset experience is only available in developer builds.");
    }
    return resetWorkspaceExperience(db, id);
  });

  ipcMain.handle(IPC.WORKSPACE_SET_ACTIVE, (_e, workspaceId: string) => {
    const db = requireDb();
    setActiveWorkspace(db, assertNonEmptyString(workspaceId, "workspaceId"));
    return buildAppState();
  });

  ipcMain.handle(
    IPC.WORKSPACE_UPDATE_CONTINUITY_SUMMARY,
    (_e, workspaceId: unknown, summary: unknown) => {
      const db = requireDb();
      const id = assertNonEmptyString(workspaceId, "workspaceId");
      if (typeof summary !== "string") {
        throw new Error("summary must be a string");
      }
      return updateContinuitySummary(db, id, summary);
    },
  );

  ipcMain.handle(IPC.CONTEXT_PACK_BUILD, (_e, input: unknown) => {
    const db = requireDb();
    return buildUniversalContextPack(db, assertContextPackBuildInput(input));
  });

  ipcMain.handle(IPC.CONTINUITY_IMPORT_PREVIEW, (_e, input: unknown) => {
    return previewContinuityImportFile(assertContinuityImportPreviewInput(input));
  });

  ipcMain.handle(IPC.CONTINUITY_IMPORT_APPLY, (_e, input: unknown) => {
    const db = requireDb();
    return applyContinuityImportFile(db, assertContinuityImportApplyInput(input));
  });

  ipcMain.handle(IPC.MARKDOWN_MEMORY_EXPORT, (_e, input: unknown) => {
    const db = requireDb();
    return exportMarkdownMemoryFile(db, assertMarkdownMemoryExportInput(input));
  });

  ipcMain.handle(IPC.MARKDOWN_MEMORY_LIST, (_e, workspaceId: unknown) => {
    const db = requireDb();
    return listMarkdownMemoryRecords(db, assertNonEmptyString(workspaceId, "workspaceId"));
  });

  ipcMain.handle(IPC.STRUCTURED_MEMORY_EVENTS_LIST, (_e, workspaceId: unknown) => {
    const db = requireDb();
    return listStructuredMemoryEventRecords(db, assertNonEmptyString(workspaceId, "workspaceId"));
  });

  ipcMain.handle(IPC.MANUAL_EXCHANGE_SAVE, (_e, input: unknown) => {
    const db = requireDb();
    return saveManualExchange(db, assertManualExchangeSaveInput(input));
  });

  ipcMain.handle(IPC.MANUAL_ASSISTANT_RESPONSE_SAVE, (_e, input: unknown) => {
    const db = requireDb();
    return saveManualAssistantResponse(db, assertManualAssistantResponseSaveInput(input));
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
      recordExport();
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
      const threads = listThreads(db, assertNonEmptyString(workspaceId, "workspaceId"), {
        includeArchived: Boolean(opts.includeArchived),
        includeDeleted: Boolean(opts.includeDeleted),
      });
      recordThreadCount(threads.length);
      return threads;
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

  ipcMain.handle(IPC.MESSAGE_SAVE_LOCAL, (_e, input: unknown) => {
    const db = requireDb();
    const parsed = assertSendMessageInput(input);
    return insertMessage(db, {
      threadId: parsed.threadId,
      role: "user",
      content: parsed.content,
    });
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
      const snap = createManualSnapshot(
        db,
        assertNonEmptyString(workspaceId, "workspaceId"),
        {
          label: typeof label === "string" ? label : undefined,
          threadId: typeof threadId === "string" ? threadId : null,
        },
      );
      recordSavepoint();
      return snap;
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
    const result = executeWorkspaceImport(db, json);
    if (result.ok) {
      recordImport();
    }
    return result;
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

  ipcMain.handle(IPC.LOCAL_AI_STATUS, async (_e, workspaceId: unknown, preferredBaseUrl?: unknown) => {
    const db = requireDb();
    const preferred =
      typeof preferredBaseUrl === "string" ? preferredBaseUrl : undefined;
    return getLocalAiStatus(
      db,
      assertNonEmptyString(workspaceId, "workspaceId"),
      preferred,
    );
  });

  ipcMain.handle(IPC.EMBEDDED_LOCAL_AI_STATUS, () => {
    return getEmbeddedLocalLlmStatus();
  });

  ipcMain.handle(IPC.EMBEDDED_LOCAL_AI_CONSUMER_STATUS, () => {
    return getConsumerStatus();
  });

  ipcMain.handle(IPC.EMBEDDED_LOCAL_AI_PREPARE, async (_e, workspaceId: unknown) => {
    const db = requireDb();
    const wsId = assertNonEmptyString(workspaceId, "workspaceId");
    return prepareEmbeddedLocalAiOnFirstRun(db, wsId, resolveUserDataDir());
  });

  ipcMain.handle(IPC.EMBEDDED_LOCAL_AI_PAUSE, () => {
    return pauseEmbeddedLocalAiDownload(resolveUserDataDir());
  });

  ipcMain.handle(IPC.EMBEDDED_LOCAL_AI_RESUME, async (_e, workspaceId: unknown) => {
    const status = resumeEmbeddedLocalAiDownload(resolveUserDataDir());
    const wsId = typeof workspaceId === "string" ? workspaceId.trim() : "";
    if (wsId) {
      const db = requireDb();
      void prepareEmbeddedLocalAiOnFirstRun(db, wsId, resolveUserDataDir()).catch(() => undefined);
    }
    return status;
  });

  ipcMain.handle(IPC.EMBEDDED_LOCAL_AI_RESTART, async (_e, workspaceId: unknown) => {
    const db = requireDb();
    const wsId = assertNonEmptyString(workspaceId, "workspaceId");
    return restartEmbeddedLocalAiDownload(db, wsId, resolveUserDataDir());
  });

  ipcMain.handle(IPC.MEMORY_COMPRESSION_PREVIEW, (_e, input: unknown) => {
    const db = requireDb();
    if (!input || typeof input !== "object") {
      throw new Error("Invalid memory compression input.");
    }
    const payload = input as { workspaceId?: unknown; threadId?: unknown };
    const draft = buildMemoryCompressionDraft(db, {
      workspaceId: assertNonEmptyString(payload.workspaceId, "workspaceId"),
      threadId:
        typeof payload.threadId === "string" && payload.threadId.trim()
          ? assertThreadId(payload.threadId)
          : null,
    });
    recordCompressionCycle();
    return draft;
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
      const wsId = assertNonEmptyString(workspaceId, "workspaceId");
      const prev = getProviderConfig(db, wsId);
      const saved = saveProviderConfig(
        db,
        wsId,
        assertNonEmptyString(provider, "provider"),
        assertNonEmptyString(model, "model"),
        apiKey,
        typeof baseUrl === "string" ? baseUrl : null,
      );
      if (prev?.provider !== saved.provider) {
        recordProviderSwitch();
      }
      touchWorkspaceActivity(db, wsId);
      return saved;
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

  ipcMain.handle(IPC.CONTINUITY_INSPECTOR_GET, (_e, input: unknown) => {
    const enabled =
      process.env.CONTINUITY_DEBUG_INSPECTOR === "1" || process.env.NODE_ENV !== "production";
    if (!enabled) {
      throw new Error("Continuity inspector is disabled.");
    }
    const db = requireDb();
    return getContinuityInspectorReport(db, assertContinuityInspectorInput(input));
  });
}
