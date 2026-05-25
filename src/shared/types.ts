export type MessageStatus =
  | "streaming"
  | "completed"
  | "interrupted"
  | "cancelled"
  | "failed";

export type TimelineEventType =
  | "workspace_created"
  | "thread_created"
  | "thread_renamed"
  | "thread_reordered"
  | "thread_archived"
  | "thread_unarchived"
  | "thread_deleted"
  | "thread_restored"
  | "message_added"
  | "provider_configured"
  | "snapshot_created"
  | "assistant_response_started"
  | "assistant_response_completed"
  | "assistant_response_cancelled"
  | "assistant_response_failed"
  | "assistant_response_interrupted"
  | "recovery_mode_entered"
  | "recovery_snapshot_created"
  | "sqlite_integrity_failed"
  | "sqlite_integrity_restored"
  | "snapshot_restore_started"
  | "snapshot_restore_completed"
  | "snapshot_restore_failed"
  | "workspace_import_started"
  | "workspace_import_completed"
  | "workspace_import_failed"
  | "continuity_import_file_applied"
  | "continuity_summary_updated"
  | "manual_context_pack_created"
  | "manual_ai_response_saved";

export type TimelineEventSource = "user" | "system" | "import" | "recovery";

export type MessageRole = "user" | "assistant" | "system";

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  /** User-editable project context — not a substitute for message history. */
  continuitySummary: string | null;
};

export type Thread = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number | null;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type ThreadListOptions = {
  includeArchived?: boolean;
  includeDeleted?: boolean;
};

export type ThreadActionResult = {
  thread: Thread | null;
  activeThreadId: string | null;
  createdThread: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  rawProviderPayload: string | null;
  messageStatus: MessageStatus;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  workspaceId: string;
  threadId: string | null;
  type: TimelineEventType;
  title: string;
  description: string;
  source: TimelineEventSource;
  createdAt: string;
  appVersion?: string | null;
  schemaVersion?: number | null;
  buildNumber?: string | null;
};

export type AppVersionInfo = {
  appName: string;
  appVersion: string;
  buildNumber: string;
  schemaVersion: number;
  releaseChannel: string;
  buildDate: string;
};

export type DiagnosticsReport = {
  appName: string;
  appVersion: string;
  buildNumber: string;
  releaseChannel: string;
  releaseBadge: string;
  releaseBadgeTone: "dev" | "beta" | "stable";
  buildDate: string;
  schemaVersion: number;
  appliedMigrationVersion: number;
  databasePath: string;
  recoveryMode: boolean;
  recoveryMessage: string | null;
  lastSnapshotAt: string | null;
  lastSuccessfulPersistenceAt: string | null;
  lastExportAt: string | null;
  lastExportAppVersion: string | null;
  startupWarnings: string[];
  downgradeDetected: boolean;
  updateReadiness: UpdateReadinessReport;
};

export type DiagnosticsBundle = {
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  releaseChannel: string;
  releaseBadge: string;
  buildDate: string;
  appliedMigrationVersion: number;
  recoveryMode: boolean;
  recoveryMessage: string | null;
  replayValidation: {
    ok: boolean;
    errorCount: number;
    warningCount: number;
  } | null;
  integrityScan: {
    status: string;
    warningCount: number;
    errorCount: number;
  } | null;
  auditSummary: { total: number; recentTypes: string[] };
  crashSummary: {
    recentCount: number;
    lastCrashAt: string | null;
    lastMessage: string | null;
  };
  migrationAuditSummary: {
    recentCount: number;
    lastAppliedVersion: number | null;
  };
  startupCompatibility: {
    ok: boolean;
    downgradeDetected: boolean;
    warningCount: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    threadCount: number;
    messageCount: number;
    lastOpenedAt: string;
  }>;
};

export type EncryptedExportResult = {
  ok: boolean;
  json?: string;
  error?: string;
};

export type WorkspaceExportResult = {
  ok: boolean;
  json?: string;
  error?: string;
  verification?: ExportVerificationSummary;
  exportWarnings?: string[];
  manifestChecksum?: string;
  integritySignaturePlaceholder?: string;
};

export type ProviderDefinitionStatus = "ready" | "setup_only" | "coming_soon";

export type ProviderConfig = {
  id: string;
  workspaceId: string;
  provider: string;
  displayName: string;
  model: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** True when a key exists in OS secure storage (never exposes the secret). */
  hasApiKey: boolean;
  baseUrl: string | null;
  providerStatus: ProviderDefinitionStatus;
  runtimeReady: boolean;
};

export type ProviderTestStatus =
  | "success"
  | "invalid_key"
  | "network_error"
  | "quota_exceeded"
  | "adapter_not_ready"
  | "ollama_unreachable"
  | "unknown_error";

export type ProviderTestResult = {
  ok: boolean;
  status: ProviderTestStatus;
  message: string;
};

export type SecureStorageDiagnostics = {
  adapterName: string;
  secureStorageAvailable: boolean;
  encryptionAvailable: boolean;
  secretsDirectory: string | null;
  lastError: string | null;
};

export type SnapshotRecord = {
  id: string;
  workspaceId: string;
  threadId: string | null;
  label: string;
  reason: string | null;
  appVersion: string | null;
  schemaVersion: number | null;
  isAuto: boolean;
  replayHash: string | null;
  createdAt: string;
  payloadJson: string;
  lastRestoredAt?: string | null;
  restoreStatus?: "never" | "completed" | "failed" | null;
  hasCheckpoint?: boolean;
};

export type MessagePageResult = {
  messages: Message[];
  totalCount: number;
  hasMoreOlder: boolean;
  oldestLoadedCreatedAt: string | null;
  oldestLoadedId: string | null;
};

export type ExportVerificationSummary = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  replayHash: string;
  replayValidationOk: boolean;
  checksumPlaceholder: string;
  snapshotIssues: number;
  orphanMessageCount: number;
};

export type OrphanMessageSample = {
  id: string;
  threadId: string;
  role: string;
  createdAt: string;
  contentPreview: string;
};

export type OrphanRepairPreview = {
  orphanCount: number;
  samples: OrphanMessageSample[];
  recommendations: Array<"attach_to_recovered_thread" | "quarantine">;
  workspaceExists: boolean;
  workspaceId: string | null;
  message: string;
};

export type OrphanRepairResult = {
  ok: boolean;
  message: string;
  repairedCount: number;
  recoveredThreadId?: string;
  quarantinedCount?: number;
};

export type WorkspaceHealthReport = {
  status: "healthy" | "attention" | "unhealthy";
  replayIntegrityOk: boolean;
  replayHash: string | null;
  replayHashStatus: "verified" | "unknown" | "mismatch";
  lastSnapshotAt: string | null;
  exportValidationOk: boolean | null;
  exportWarnings: string[];
  interruptedResponsesRecovered: number;
  integrityWarnings: string[];
  lastRecoverySnapshotPath: string | null;
  autosaveCooldownActive: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
};

export type AutosaveStatus = {
  lastAutosaveAt: string | null;
  nextEligibleAt: string | null;
  cooldownActive: boolean;
  minIntervalMs: number;
};

export type ImportPreview = {
  valid: boolean;
  workspaceName: string;
  threadCount: number;
  messageCount: number;
  snapshotCount: number;
  exportVersion: number;
  exportedAt: string;
  schemaVersion: number;
  appVersion: string;
  warnings: string[];
  errors: string[];
  encrypted?: boolean;
};

export type EncryptedImportPreviewResult = {
  ok: boolean;
  error: string | null;
  wrongPassword: boolean;
  preview: ImportPreview | null;
  workspaceNameHint: string | null;
};

export type RestorePreview = {
  canRestore: boolean;
  snapshotId: string;
  label: string;
  createdAt: string;
  appVersion: string | null;
  schemaVersion: number | null;
  affectedThreadCount: number;
  affectedMessageCount: number;
  messagesAddedEstimate: number;
  messagesRemovedEstimate: number;
  replayHashStatus: "verified" | "unknown" | "mismatch" | "not_available";
  warnings: string[];
  errors: string[];
  summaryMessage: string;
};

export type MigrationDryRunReport = {
  currentSchemaVersion: number;
  targetSchemaVersion: number;
  appliedMigrationVersion: number;
  pendingMigrationVersions: number[];
  pendingCount: number;
  wouldCreateRecoverySnapshot: boolean;
  compatibilityOk: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  releaseChannel: string;
  appVersion: string;
};

export type UpdateReadinessReport = {
  status: "ready" | "attention" | "blocked";
  autoUpdateEnabled: boolean;
  releaseChannel: string;
  releaseBadge: string;
  currentAppVersion: string;
  currentSchemaVersion: number;
  appliedMigrationVersion: number;
  pendingMigrationCount: number;
  downgradeDetected: boolean;
  migrationSafetyWarning: string | null;
  compatibilityOk: boolean;
  warnings: string[];
  errors: string[];
  summary: string;
};

export type BackupReminderStatus = {
  shouldShow: boolean;
  message: string | null;
  lastExportAt: string | null;
  lastShownAt: string | null;
  dismissedUntil: string | null;
  intervalMs: number;
  daysSinceExport: number | null;
};

export type RestoreExecutionResult = {
  ok: boolean;
  message: string;
  snapshotId: string;
  preRecoverySnapshotPath: string | null;
  replayHashPlaceholder?: string;
};

export type ImportExecutionResult = {
  ok: boolean;
  message: string;
  workspaceId?: string;
  workspace?: Workspace;
};

export type MarkdownMemoryFileType =
  | "continuity-import"
  | "continuity-export"
  | "ai-handoff"
  | "thread-summary"
  | "project-state";

export type ContinuityImportMode =
  | "update-current"
  | "create-workspace"
  | "checkpoint-only";

export type MarkdownMemoryPreview = {
  valid: boolean;
  fileType: MarkdownMemoryFileType;
  source: string;
  version: number | null;
  sourceAi: string;
  generatedAt: string;
  projectName: string;
  projectType: string;
  currentObjective: string;
  continuitySummary: string;
  stableFacts: string[];
  recentProgress: string[];
  decisionsMade: string[];
  openIssues: string[];
  nextSteps: string[];
  importantContextForNextAi: string;
  recentConversationExcerpts: string;
  testBuildGitStatus: string[];
  risksWarnings: string[];
  rulesForFutureAi: string[];
  warnings: string[];
  errors: string[];
};

export type ContinuityImportPreview = MarkdownMemoryPreview;

export type ContinuityImportApplyResult = {
  ok: boolean;
  message: string;
  mode: ContinuityImportMode;
  workspace: Workspace | null;
  sourceAi: string;
  projectName: string;
};

export type MarkdownMemoryRecordSummary = {
  id: string;
  workspaceId: string;
  fileType: MarkdownMemoryFileType;
  source: string;
  sourceAi: string;
  title: string;
  projectName: string;
  currentObjective: string;
  continuitySummary: string;
  decisionsMade: string[];
  openIssues: string[];
  nextSteps: string[];
  createdAt: string;
  rawMarkdown: string;
};

export type MarkdownMemoryExportResult = {
  fileType: MarkdownMemoryFileType;
  fileName: string;
  markdown: string;
  preview: MarkdownMemoryPreview;
};

export type LocalAiStatus = {
  detected: boolean;
  baseUrl: string;
  models: string[];
  selected: boolean;
  selectedModel: string | null;
  message: string;
};

export type TimelineGroup = {
  label: string;
  events: TimelineEventView[];
};

export type TimelineEventView = TimelineEvent & {
  humanLabel: string;
  relativeTime: string;
};

export type SnapshotRestorePlaceholder = {
  canRestore: boolean;
  message: string;
  snapshotId: string;
};

export type ReplayValidationReport = {
  ok: boolean;
  warnings: string[];
  errors: string[];
  repairRecommendations: string[];
};

export type AppState = {
  recoveryMode: boolean;
  recoveryMessage: string | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  dbReady: boolean;
  continuityHealthy: boolean;
  interruptedResponsesRecovered: number;
  sqliteRepairAttempted: boolean;
  sqliteIntegrityRestored: boolean;
  reliabilityMessage: string | null;
  lastSnapshotAt: string | null;
  lastSuccessfulPersistenceAt: string | null;
  version: AppVersionInfo;
  appliedMigrationVersion: number;
  migrationsJustApplied: number[];
  previousSessionCrashed: boolean;
  downgradeDetected: boolean;
  startupWarnings: string[];
};

export type SendMessageInput = {
  threadId: string;
  role: MessageRole;
  content: string;
};

export type UniversalContextPackResult = {
  targetPlatform: string;
  text: string;
  includedRecentMessageCount: number;
  truncatedOlderMessages: boolean;
};

export type ManualExchangeSaveResult = {
  userMessage: Message;
  assistantMessage: Message;
  targetPlatform: string;
};

export type ManualAssistantResponseSaveResult = {
  assistantMessage: Message;
  targetPlatform: string;
  sourceUserMessageId: string | null;
};

export type SendMessageResult = {
  message: Message;
  assistantPlaceholder: Message | null;
};

export type StreamStartResult = {
  streamId: string | null;
  userMessage: Message;
  assistantMessage: Message | null;
  error?: string;
};

export type StreamDeltaEvent = {
  streamId: string;
  messageId: string;
  delta: string;
  content: string;
};

export type StreamDoneEvent = {
  streamId: string;
  message: Message;
};

export type StreamErrorEvent = {
  streamId: string;
  messageId: string;
  content: string;
  error: string;
  cancelled: boolean;
};
