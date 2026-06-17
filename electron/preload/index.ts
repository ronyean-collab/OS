import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC } from "../../src/shared/ipc-channels";
import type {
  AppState,
  AppVersionInfo,
  AssistantProfile,
  AssistantProfileUpdate,
  AutosaveStatus,
  DiagnosticsReport,
  ContinuityImportApplyResult,
  ContinuityImportPreview,
  EmbeddedLocalLlmStatus,
  EmbeddedAiConsumerStatus,
  MarkdownMemoryExportResult,
  MarkdownMemoryFileType,
  MarkdownMemoryRecordSummary,
  MemoryCompressionDraft,
  Message,
  ManualAssistantResponseSaveResult,
  ManualExchangeSaveResult,
  MessagePageResult,
  ProviderConfig,
  ImportExecutionResult,
  ImportPreview,
  ReplayValidationReport,
  RestoreExecutionResult,
  SnapshotRecord,
  SnapshotRestorePlaceholder,
  StreamDeltaEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  StreamStartResult,
  Thread,
  ThreadActionResult,
  ThreadListOptions,
  TimelineEvent,
  TimelineGroup,
  Workspace,
  DiagnosticsBundle,
  EncryptedExportResult,
  EncryptedImportPreviewResult,
  MigrationDryRunReport,
  RestorePreview,
  UpdateReadinessReport,
  UniversalContextPackResult,
  BackupReminderStatus,
  WorkspaceExportResult,
  WorkspaceHealthReport,
  ProviderTestResult,
  LocalAiStatus,
  SecureStorageDiagnostics,
  ContinuityInspectorReport,
} from "../../src/shared/types";

type StreamHandlers = {
  onDelta?: (event: StreamDeltaEvent) => void;
  onDone?: (event: StreamDoneEvent) => void;
  onError?: (event: StreamErrorEvent) => void;
};

const streamListenerCleanups: Array<() => void> = [];

function attachStreamListeners(handlers: StreamHandlers): () => void {
  const onDelta = (_e: IpcRendererEvent, payload: StreamDeltaEvent) => {
    handlers.onDelta?.(payload);
  };
  const onDone = (_e: IpcRendererEvent, payload: StreamDoneEvent) => {
    handlers.onDone?.(payload);
  };
  const onError = (_e: IpcRendererEvent, payload: StreamErrorEvent) => {
    handlers.onError?.(payload);
  };

  ipcRenderer.on(IPC.STREAM_DELTA, onDelta);
  ipcRenderer.on(IPC.STREAM_DONE, onDone);
  ipcRenderer.on(IPC.STREAM_ERROR, onError);

  const cleanup = () => {
    ipcRenderer.removeListener(IPC.STREAM_DELTA, onDelta);
    ipcRenderer.removeListener(IPC.STREAM_DONE, onDone);
    ipcRenderer.removeListener(IPC.STREAM_ERROR, onError);
  };
  streamListenerCleanups.push(cleanup);
  return cleanup;
}

const api = {
  getAppState: (): Promise<AppState> => ipcRenderer.invoke(IPC.APP_GET_STATE),

  getAppVersion: (): Promise<AppVersionInfo> =>
    ipcRenderer.invoke(IPC.APP_GET_VERSION),

  getDiagnostics: (workspaceId?: string): Promise<DiagnosticsReport> =>
    ipcRenderer.invoke(IPC.DIAGNOSTICS_GET, workspaceId ?? ""),

  copyDiagnostics: (workspaceId?: string): Promise<string> =>
    ipcRenderer.invoke(IPC.DIAGNOSTICS_COPY, workspaceId ?? ""),

  exportDiagnostics: (
    workspaceId?: string,
  ): Promise<{ ok: boolean; json?: string }> =>
    ipcRenderer.invoke(IPC.DIAGNOSTICS_EXPORT, workspaceId ?? ""),

  copyDiagnosticsBundle: (workspaceId?: string): Promise<string> =>
    ipcRenderer.invoke(IPC.DIAGNOSTICS_BUNDLE_COPY, workspaceId ?? ""),

  reportRendererCrash: (payload: { message: string; stack?: string }) =>
    ipcRenderer.invoke(IPC.APP_REPORT_RENDERER_CRASH, payload),

  exportWorkspaceEncrypted: (
    workspaceId: string,
    password: string,
  ): Promise<EncryptedExportResult> =>
    ipcRenderer.invoke(IPC.WORKSPACE_EXPORT_ENCRYPTED, workspaceId, password),

  listWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke(IPC.WORKSPACE_LIST),

  createWorkspace: (name: string): Promise<Workspace> =>
    ipcRenderer.invoke(IPC.WORKSPACE_CREATE, name),

  getActiveWorkspace: (): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC.WORKSPACE_GET_ACTIVE),

  setActiveWorkspace: (workspaceId: string): Promise<AppState> =>
    ipcRenderer.invoke(IPC.WORKSPACE_SET_ACTIVE, workspaceId),

  updateContinuitySummary: (
    workspaceId: string,
    summary: string,
  ): Promise<Workspace> =>
    ipcRenderer.invoke(IPC.WORKSPACE_UPDATE_CONTINUITY_SUMMARY, workspaceId, summary),

  updateWorkspaceProfile: (
    workspaceId: string,
    patch: { name?: string; description?: string | null },
  ): Promise<Workspace> =>
    ipcRenderer.invoke(IPC.WORKSPACE_UPDATE_PROFILE, workspaceId, patch),

  getDailyDriverMetrics: (): Promise<import("@shared/daily-driver-metrics").DailyDriverMetricsFile> =>
    ipcRenderer.invoke(IPC.DAILY_DRIVER_METRICS_GET),

  getAssistantProfile: (): Promise<AssistantProfile> =>
    ipcRenderer.invoke(IPC.ASSISTANT_GET_PROFILE),

  updateAssistantProfile: (patch: AssistantProfileUpdate): Promise<AssistantProfile> =>
    ipcRenderer.invoke(IPC.ASSISTANT_UPDATE_PROFILE, patch),

  buildContextPack: (input: {
    workspaceId: string;
    threadId: string;
    userRequest: string;
    targetPlatform?: string;
  }): Promise<UniversalContextPackResult> =>
    ipcRenderer.invoke(IPC.CONTEXT_PACK_BUILD, input),

  previewContinuityImport: (text: string): Promise<ContinuityImportPreview> =>
    ipcRenderer.invoke(IPC.CONTINUITY_IMPORT_PREVIEW, text),

  applyContinuityImport: (input: {
    text: string;
    mode: "update-current" | "create-workspace" | "checkpoint-only";
    workspaceId?: string;
  }): Promise<ContinuityImportApplyResult> =>
    ipcRenderer.invoke(IPC.CONTINUITY_IMPORT_APPLY, input),

  exportMarkdownMemory: (input: {
    workspaceId: string;
    threadId?: string;
    fileType: MarkdownMemoryFileType;
  }): Promise<MarkdownMemoryExportResult> =>
    ipcRenderer.invoke(IPC.MARKDOWN_MEMORY_EXPORT, input),

  listMarkdownMemoryRecords: (workspaceId: string): Promise<MarkdownMemoryRecordSummary[]> =>
    ipcRenderer.invoke(IPC.MARKDOWN_MEMORY_LIST, workspaceId),

  listStructuredMemoryEventRecords: (workspaceId: string): Promise<Array<{
    id: string;
    workspaceId: string;
    createdAt: string;
    markdown: string;
    parsed: Record<string, unknown>;
  }>> =>
    ipcRenderer.invoke(IPC.STRUCTURED_MEMORY_EVENTS_LIST, workspaceId),
  saveManualExchange: (input: {
    workspaceId: string;
    threadId: string;
    userRequest: string;
    assistantResponse: string;
    targetPlatform?: string;
  }): Promise<ManualExchangeSaveResult> =>
    ipcRenderer.invoke(IPC.MANUAL_EXCHANGE_SAVE, input),

  saveManualAssistantResponse: (input: {
    workspaceId: string;
    threadId: string;
    assistantResponse: string;
    targetPlatform?: string;
    sourceUserMessageId?: string;
  }): Promise<ManualAssistantResponseSaveResult> =>
    ipcRenderer.invoke(IPC.MANUAL_ASSISTANT_RESPONSE_SAVE, input),

  exportWorkspace: (workspaceId: string): Promise<WorkspaceExportResult> =>
    ipcRenderer.invoke(IPC.WORKSPACE_EXPORT, workspaceId),

  listThreads: (
    workspaceId: string,
    options?: ThreadListOptions,
  ): Promise<Thread[]> => ipcRenderer.invoke(IPC.THREAD_LIST, workspaceId, options ?? {}),

  createThread: (workspaceId: string, title: string): Promise<Thread> =>
    ipcRenderer.invoke(IPC.THREAD_CREATE, workspaceId, title),

  renameThread: (threadId: string, title: string): Promise<Thread> =>
    ipcRenderer.invoke(IPC.THREAD_RENAME, threadId, title),

  moveThreadUp: (threadId: string): Promise<Thread> =>
    ipcRenderer.invoke(IPC.THREAD_MOVE_UP, threadId),

  moveThreadDown: (threadId: string): Promise<Thread> =>
    ipcRenderer.invoke(IPC.THREAD_MOVE_DOWN, threadId),

  archiveThread: (
    threadId: string,
  ): Promise<{ thread: Thread; repair: ThreadActionResult }> =>
    ipcRenderer.invoke(IPC.THREAD_ARCHIVE, threadId),

  unarchiveThread: (threadId: string): Promise<Thread> =>
    ipcRenderer.invoke(IPC.THREAD_UNARCHIVE, threadId),

  deleteThread: (
    threadId: string,
  ): Promise<{ thread: Thread; repair: ThreadActionResult }> =>
    ipcRenderer.invoke(IPC.THREAD_DELETE, threadId),

  restoreThread: (threadId: string): Promise<Thread> =>
    ipcRenderer.invoke(IPC.THREAD_RESTORE, threadId),

  repairActiveThread: (workspaceId: string): Promise<ThreadActionResult> =>
    ipcRenderer.invoke(IPC.THREAD_REPAIR_ACTIVE, workspaceId),

  setActiveThread: (threadId: string): Promise<AppState> =>
    ipcRenderer.invoke(IPC.THREAD_SET_ACTIVE, threadId),

  listMessages: (threadId: string): Promise<Message[]> =>
    ipcRenderer.invoke(IPC.MESSAGE_LIST, threadId),

  listMessagesPage: (
    threadId: string,
    options?: {
      limit?: number;
      beforeCreatedAt?: string | null;
      beforeId?: string | null;
    },
  ): Promise<MessagePageResult> =>
    ipcRenderer.invoke(IPC.MESSAGE_LIST_PAGE, threadId, options),

  getMessageCount: (threadId: string): Promise<number> =>
    ipcRenderer.invoke(IPC.MESSAGE_COUNT, threadId),

  saveLocalUserMessage: (input: {
    threadId: string;
    content: string;
  }): Promise<Message> => ipcRenderer.invoke(IPC.MESSAGE_SAVE_LOCAL, input),

  getWorkspaceHealth: (workspaceId: string): Promise<WorkspaceHealthReport> =>
    ipcRenderer.invoke(IPC.WORKSPACE_HEALTH, workspaceId),

  getAutosaveStatus: (): Promise<AutosaveStatus> =>
    ipcRenderer.invoke(IPC.AUTOSAVE_STATUS),

  getContinuityInspector: (input: {
    workspaceId: string;
    threadId: string;
    query?: string;
  }): Promise<ContinuityInspectorReport> =>
    ipcRenderer.invoke(IPC.CONTINUITY_INSPECTOR_GET, input),

  startMessageStream: (input: {
    threadId: string;
    content: string;
    visibleContent?: string;
    ollama?: { model: string; baseUrl: string };
  }): Promise<StreamStartResult> =>
    ipcRenderer.invoke(IPC.MESSAGE_STREAM_START, input),

  cancelMessageStream: (streamId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.MESSAGE_STREAM_CANCEL, streamId),

  onStreamEvents: (handlers: StreamHandlers): (() => void) =>
    attachStreamListeners(handlers),

  listTimeline: (workspaceId: string): Promise<TimelineEvent[]> =>
    ipcRenderer.invoke(IPC.TIMELINE_LIST, workspaceId),

  listTimelineGrouped: (workspaceId: string): Promise<TimelineGroup[]> =>
    ipcRenderer.invoke(IPC.TIMELINE_LIST_GROUPED, workspaceId),

  listSnapshots: (workspaceId: string): Promise<SnapshotRecord[]> =>
    ipcRenderer.invoke(IPC.SNAPSHOT_LIST, workspaceId),

  createSnapshot: (
    workspaceId: string,
    label?: string,
    threadId?: string | null,
  ): Promise<SnapshotRecord> =>
    ipcRenderer.invoke(IPC.SNAPSHOT_CREATE, workspaceId, label, threadId),

  validateSnapshotRestore: (
    snapshotId: string,
    workspaceId: string,
  ): Promise<SnapshotRestorePlaceholder> =>
    ipcRenderer.invoke(IPC.SNAPSHOT_VALIDATE_RESTORE, snapshotId, workspaceId),

  restoreSnapshot: (
    snapshotId: string,
    workspaceId: string,
  ): Promise<RestoreExecutionResult> =>
    ipcRenderer.invoke(IPC.SNAPSHOT_RESTORE, snapshotId, workspaceId),

  previewWorkspaceImport: (json: string): Promise<ImportPreview> =>
    ipcRenderer.invoke(IPC.WORKSPACE_IMPORT_PREVIEW, json),

  importWorkspace: (json: string): Promise<ImportExecutionResult> =>
    ipcRenderer.invoke(IPC.WORKSPACE_IMPORT, json),

  previewEncryptedImport: (
    json: string,
    password: string,
  ): Promise<EncryptedImportPreviewResult> =>
    ipcRenderer.invoke(IPC.WORKSPACE_IMPORT_ENCRYPTED_PREVIEW, json, password),

  importEncryptedWorkspace: (
    json: string,
    password: string,
  ): Promise<ImportExecutionResult> =>
    ipcRenderer.invoke(IPC.WORKSPACE_IMPORT_ENCRYPTED, json, password),

  getRestorePreview: (
    snapshotId: string,
    workspaceId: string,
  ): Promise<RestorePreview> =>
    ipcRenderer.invoke(IPC.SNAPSHOT_RESTORE_PREVIEW, snapshotId, workspaceId),

  runMigrationDryRun: (): Promise<MigrationDryRunReport> =>
    ipcRenderer.invoke(IPC.MIGRATION_DRY_RUN),

  getUpdateReadiness: (): Promise<UpdateReadinessReport> =>
    ipcRenderer.invoke(IPC.UPDATE_READINESS),

  getBackupReminderStatus: (): Promise<BackupReminderStatus> =>
    ipcRenderer.invoke(IPC.BACKUP_REMINDER_STATUS),

  recordBackupReminderShown: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.BACKUP_REMINDER_SHOWN),

  dismissBackupReminder: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.BACKUP_REMINDER_DISMISS),

  validateReplay: (workspaceId: string): Promise<ReplayValidationReport> =>
    ipcRenderer.invoke(IPC.REPLAY_VALIDATE, workspaceId),

  getProviderConfig: (workspaceId: string): Promise<ProviderConfig | null> =>
    ipcRenderer.invoke(IPC.PROVIDER_GET_CONFIG, workspaceId),

  saveProviderConfig: (
    workspaceId: string,
    provider: string,
    model: string,
    apiKey: string,
    baseUrl?: string | null,
  ): Promise<ProviderConfig> =>
    ipcRenderer.invoke(
      IPC.PROVIDER_SAVE_CONFIG,
      workspaceId,
      provider,
      model,
      apiKey,
      baseUrl ?? null,
    ),

  testProviderConnection: (
    workspaceId: string,
    options?: {
      apiKey?: string;
      provider?: string;
      model?: string;
      baseUrl?: string;
    },
  ): Promise<ProviderTestResult> =>
    ipcRenderer.invoke(IPC.PROVIDER_TEST_CONNECTION, workspaceId, options ?? {}),

  removeProviderKey: (
    workspaceId: string,
    provider: string,
  ): Promise<ProviderConfig | null> =>
    ipcRenderer.invoke(IPC.PROVIDER_REMOVE_KEY, workspaceId, provider),

  getLocalAiStatus: (
    workspaceId: string,
    preferredBaseUrl?: string,
  ): Promise<LocalAiStatus> =>
    ipcRenderer.invoke(IPC.LOCAL_AI_STATUS, workspaceId, preferredBaseUrl),

  getEmbeddedLocalAiStatus: (): Promise<EmbeddedLocalLlmStatus> =>
    ipcRenderer.invoke(IPC.EMBEDDED_LOCAL_AI_STATUS),

  getEmbeddedAiConsumerStatus: (): Promise<EmbeddedAiConsumerStatus> =>
    ipcRenderer.invoke(IPC.EMBEDDED_LOCAL_AI_CONSUMER_STATUS),

  prepareEmbeddedLocalAi: (workspaceId: string): Promise<EmbeddedAiConsumerStatus> =>
    ipcRenderer.invoke(IPC.EMBEDDED_LOCAL_AI_PREPARE, workspaceId),

  pauseEmbeddedLocalAi: (): Promise<EmbeddedAiConsumerStatus> =>
    ipcRenderer.invoke(IPC.EMBEDDED_LOCAL_AI_PAUSE),

  resumeEmbeddedLocalAi: (workspaceId: string): Promise<EmbeddedAiConsumerStatus> =>
    ipcRenderer.invoke(IPC.EMBEDDED_LOCAL_AI_RESUME, workspaceId),

  restartEmbeddedLocalAi: (workspaceId: string): Promise<EmbeddedAiConsumerStatus> =>
    ipcRenderer.invoke(IPC.EMBEDDED_LOCAL_AI_RESTART, workspaceId),

  previewMemoryCompression: (input: {
    workspaceId: string;
    threadId?: string | null;
  }): Promise<MemoryCompressionDraft> =>
    ipcRenderer.invoke(IPC.MEMORY_COMPRESSION_PREVIEW, input),

  openExternalUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),

  getSecureStorageDiagnostics: (): Promise<SecureStorageDiagnostics> =>
    ipcRenderer.invoke(IPC.SECURE_STORAGE_DIAGNOSTICS),

  getAuthSession: () => ipcRenderer.invoke(IPC.AUTH_GET_SESSION),

  signInPlaceholder: (email: string) =>
    ipcRenderer.invoke(IPC.AUTH_SIGN_IN_PLACEHOLDER, email),

  previewOrphanRepair: (workspaceId?: string) =>
    ipcRenderer.invoke(IPC.ORPHAN_REPAIR_PREVIEW, workspaceId ?? ""),

  repairOrphanMessagesAttach: (workspaceId?: string) =>
    ipcRenderer.invoke(IPC.ORPHAN_REPAIR_ATTACH, workspaceId ?? ""),

  repairOrphanMessagesQuarantine: (workspaceId?: string) =>
    ipcRenderer.invoke(IPC.ORPHAN_REPAIR_QUARANTINE, workspaceId ?? ""),

  resetExperience: (workspaceId: string) =>
    ipcRenderer.invoke(IPC.EXPERIENCE_RESET, workspaceId),

  // Test-only: check if E2E environment should skip preparation
  isE2eReadyAssistant: (): boolean => {
    // Check for CONTINUITY_E2E_READY_ASSISTANT env var (only available in E2E tests)
    // This is a synchronous check; the env var is set via electron.launch args
    return process.env.CONTINUITY_E2E_READY_ASSISTANT === "1";
  },

  // Test-only: check if E2E environment should skip onboarding to reveal the preparation flow.
  isE2eSkipOnboarding: (): boolean => {
    return process.env.CONTINUITY_E2E_SKIP_ONBOARDING === "1";
  },
};

export type ContinuityDesktopApi = typeof api;

contextBridge.exposeInMainWorld("continuity", api);
