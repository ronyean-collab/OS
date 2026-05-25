import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppState,
  AutosaveStatus,
  ImportPreview,
  Message,
  ProviderConfig,
  SnapshotRecord,
  StreamDeltaEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  Thread,
  ThreadActionResult,
  TimelineGroup,
  UniversalContextPackResult,
  Workspace,
  WorkspaceHealthReport,
} from "@shared/types";
import { ImportPreviewModal } from "./components/ImportPreviewModal";
import { ChatPanel } from "./components/ChatPanel";
import { OpsSidebar, type OpsTabId } from "./components/OpsSidebar";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { AppFooter } from "./components/AppFooter";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { EncryptedImportFlow } from "./components/EncryptedImportFlow";
import { EncryptedExportDialog } from "./components/EncryptedExportDialog";

function PreloadBridgeFallback() {
  const isDev = import.meta.env.DEV;
  return (
    <div className="app-shell loading">
      <p>Continuity preload bridge did not initialize.</p>
      <p className="muted small">
        The Electron preload script did not load, so the UI cannot talk to the local database.
      </p>
      {isDev && (
        <p className="muted small">
          Dev check: confirm <code>out/preload/index.cjs</code> exists after{" "}
          <code>npm run dev</code> (not a stale <code>index.js</code> with{" "}
          <code>require is not defined</code>).
        </p>
      )}
    </div>
  );
}

export function App() {
  if (!window.continuity) {
    return <PreloadBridgeFallback />;
  }

  const continuity = window.continuity;

  const [appState, setAppState] = useState<AppState | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageTotalCount, setMessageTotalCount] = useState(0);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [oldestMessageCursor, setOldestMessageCursor] = useState<{
    createdAt: string;
    id: string;
  } | null>(null);
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealthReport | null>(
    null,
  );
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [opsTab, setOpsTab] = useState<OpsTabId>("overview");
  const [settingsProviderId, setSettingsProviderId] = useState<string | undefined>(
    undefined,
  );
  const [showProjectTools, setShowProjectTools] = useState(false);
  const [showArchivedThreads, setShowArchivedThreads] = useState(false);
  const [showDeletedThreads, setShowDeletedThreads] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startupPhase, setStartupPhase] = useState<
    "starting" | "migrating" | "loading" | "ready"
  >("starting");
  const [threadSwitching, setThreadSwitching] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importJson, setImportJson] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showEncryptedExport, setShowEncryptedExport] = useState(false);
  const [encryptedImport, setEncryptedImport] = useState<{
    json: string;
    fileName: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const encryptedImportInputRef = useRef<HTMLInputElement>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);

  const isProviderConfigured = (config: ProviderConfig | null) => {
    if (!config?.enabled) return false;
    if (config.provider === "ollama") return true;
    return config.hasApiKey;
  };

  const refreshAppState = useCallback(async () => {
    const state = await continuity.getAppState();
    setAppState(state);
    return state;
  }, []);

  const refreshOpsPanels = useCallback(async (wsId: string) => {
    setHealthLoading(true);
    try {
      const [groups, snapList, state, health, autosave] = await Promise.all([
        continuity.listTimelineGrouped(wsId),
        continuity.listSnapshots(wsId),
        continuity.getAppState(),
        continuity.getWorkspaceHealth(wsId),
        continuity.getAutosaveStatus(),
      ]);
      setTimelineGroups(groups);
      setSnapshots(snapList);
      setAppState(state);
      setWorkspaceHealth(health);
      setAutosaveStatus(autosave);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadThreadMessages = useCallback(async (threadId: string) => {
    const page = await continuity.listMessagesPage(threadId);
    setMessages(page.messages);
    setMessageTotalCount(page.totalCount);
    setHasMoreOlderMessages(page.hasMoreOlder);
    if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
      setOldestMessageCursor({
        createdAt: page.oldestLoadedCreatedAt,
        id: page.oldestLoadedId,
      });
    } else {
      setOldestMessageCursor(null);
    }
  }, []);

  const reloadThreads = useCallback(
    async (wsId: string, archived = showArchivedThreads, deleted = showDeletedThreads) => {
      const list = await continuity.listThreads(wsId, {
        includeArchived: archived,
        includeDeleted: deleted,
      });
      setThreads(list);
      return list;
    },
    [showArchivedThreads, showDeletedThreads],
  );

  const applyActiveThreadRepair = useCallback(
    async (repair: ThreadActionResult) => {
      if (repair.thread) {
        setActiveThread(repair.thread);
        await continuity.setActiveThread(repair.thread.id);
        await loadThreadMessages(repair.thread.id);
        setStreamError(null);
      } else {
        setActiveThread(null);
        setMessages([]);
        setMessageTotalCount(0);
        setHasMoreOlderMessages(false);
        setOldestMessageCursor(null);
      }
    },
    [loadThreadMessages],
  );

  const loadWorkspace = useCallback(async (ws: Workspace | null) => {
    setWorkspace(ws);
    if (!ws) {
      setThreads([]);
      setActiveThread(null);
      setMessages([]);
      setTimelineGroups([]);
      setSnapshots([]);
      setProviderConfig(null);
      return;
    }
    const [config] = await Promise.all([continuity.getProviderConfig(ws.id)]);
    setProviderConfig(config);
    await refreshOpsPanels(ws.id);

    const repair = await continuity.repairActiveThread(ws.id);
    const threadList = await reloadThreads(ws.id);
    const thread =
      repair.thread ?? threadList.find((t) => !t.archivedAt && !t.deletedAt) ?? null;
    setActiveThread(thread);
    if (thread) {
      await continuity.setActiveThread(thread.id);
      await loadThreadMessages(thread.id);
    } else {
      setMessages([]);
      setMessageTotalCount(0);
      setHasMoreOlderMessages(false);
      setOldestMessageCursor(null);
    }
  }, [refreshOpsPanels, loadThreadMessages, reloadThreads]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setStartupPhase("starting");
    try {
      const state = await refreshAppState();
      if (state.migrationsJustApplied.length > 0) {
        setStartupPhase("migrating");
      }
      if (state.recoveryMode) {
        setWorkspace(null);
        setStartupPhase("ready");
        return;
      }

      setStartupPhase("loading");
      let ws = await continuity.getActiveWorkspace();
      if (!ws) {
        const all = await continuity.listWorkspaces();
        ws = all[0] ?? null;
      }
      if (!ws) {
        ws = await continuity.createWorkspace("My Continuity Workspace");
      } else {
        await continuity.setActiveWorkspace(ws.id);
      }
      await loadWorkspace(ws);
      setStartupPhase("ready");
    } finally {
      setLoading(false);
    }
  }, [loadWorkspace, refreshAppState]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !workspace || appState?.recoveryMode) return;
      const key = e.key.toLowerCase();
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        void handleCreateThread();
      }
      if (e.shiftKey && key === "s") {
        e.preventDefault();
        const label = window.prompt("Snapshot label (optional)") ?? "";
        void handleCreateSnapshot(label);
      }
      if (e.shiftKey && key === "e") {
        e.preventDefault();
        void handleExport();
      }
      if (e.shiftKey && key === "k") {
        e.preventDefault();
        void handleEncryptedExport();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspace, appState?.recoveryMode]);

  useEffect(() => {
    const cleanup = continuity.onStreamEvents({
      onDelta: (event: StreamDeltaEvent) => {
        if (event.streamId !== activeStreamIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: event.content } : m,
          ),
        );
      },
      onDone: (event: StreamDoneEvent) => {
        if (event.streamId !== activeStreamIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === event.message.id ? event.message : m)),
        );
        setStreaming(false);
        activeStreamIdRef.current = null;
        assistantMessageIdRef.current = null;
        setStreamError(null);
        if (workspace) void refreshOpsPanels(workspace.id);
      },
      onError: (event: StreamErrorEvent) => {
        if (event.streamId !== activeStreamIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: event.content } : m,
          ),
        );
        setStreaming(false);
        activeStreamIdRef.current = null;
        assistantMessageIdRef.current = null;
        if (!event.cancelled) {
          setStreamError(event.error);
        } else {
          setStreamError(null);
        }
        if (workspace) void refreshOpsPanels(workspace.id);
      },
    });
    return cleanup;
  }, [workspace, refreshOpsPanels]);

  const handleCreateThread = async () => {
    if (!workspace) return;
    const thread = await continuity.createThread(
      workspace.id,
      `Thread ${threads.filter((t) => !t.deletedAt && !t.archivedAt).length + 1}`,
    );
    await reloadThreads(workspace.id);
    setActiveThread(thread);
    await continuity.setActiveThread(thread.id);
    setMessages([]);
    await refreshOpsPanels(workspace.id);
  };

  const handleSelectThread = async (thread: Thread) => {
    if (streaming || thread.id === activeThread?.id) return;
    setThreadSwitching(true);
    setActiveThread(thread);
    try {
      await continuity.setActiveThread(thread.id);
      await loadThreadMessages(thread.id);
      setStreamError(null);
    } finally {
      setThreadSwitching(false);
    }
  };

  const handleLoadOlderMessages = async () => {
    if (!activeThread || !oldestMessageCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const page = await continuity.listMessagesPage(activeThread.id, {
        beforeCreatedAt: oldestMessageCursor.createdAt,
        beforeId: oldestMessageCursor.id,
      });
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !seen.has(m.id));
        return [...older, ...prev];
      });
      setHasMoreOlderMessages(page.hasMoreOlder);
      if (page.oldestLoadedCreatedAt && page.oldestLoadedId) {
        setOldestMessageCursor({
          createdAt: page.oldestLoadedCreatedAt,
          id: page.oldestLoadedId,
        });
      }
      setMessageTotalCount(page.totalCount);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleRenameThread = async (threadId: string, title: string) => {
    const updated = await continuity.renameThread(threadId, title);
    if (workspace) await reloadThreads(workspace.id);
    if (activeThread?.id === threadId) {
      setActiveThread(updated);
    }
    if (workspace) await refreshOpsPanels(workspace.id);
  };

  const handleMoveThreadUp = async (threadId: string) => {
    if (!workspace) return;
    await continuity.moveThreadUp(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleMoveThreadDown = async (threadId: string) => {
    if (!workspace) return;
    await continuity.moveThreadDown(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleArchiveThread = async (threadId: string) => {
    if (!workspace) return;
    const result = await continuity.archiveThread(threadId);
    await reloadThreads(workspace.id);
    await applyActiveThreadRepair(result.repair);
    await refreshOpsPanels(workspace.id);
  };

  const handleUnarchiveThread = async (threadId: string) => {
    if (!workspace) return;
    await continuity.unarchiveThread(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!workspace) return;
    const result = await continuity.deleteThread(threadId);
    await reloadThreads(workspace.id);
    await applyActiveThreadRepair(result.repair);
    await refreshOpsPanels(workspace.id);
  };

  const handleRestoreThread = async (threadId: string) => {
    if (!workspace) return;
    await continuity.restoreThread(threadId);
    await reloadThreads(workspace.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleSendMessage = async (content: string) => {
    if (!activeThread || streaming) return;
    if (!providerConfig || !isProviderConfigured(providerConfig) || !providerConfig.runtimeReady) {
      setStreamError(
        "Manual Mode is ready. Copy a Context Pack into any AI and paste the response back here. API providers are optional in Project tools.",
      );
      return;
    }
    setStreamError(null);

    const result = await continuity.startMessageStream({
      threadId: activeThread.id,
      content,
    });

    const next: Message[] = [result.userMessage];
    if (result.assistantMessage) {
      next.push(result.assistantMessage);
      assistantMessageIdRef.current = result.assistantMessage.id;
    }
    setMessages((prev) => [...prev, ...next.filter((m) => !prev.some((p) => p.id === m.id))]);

    if (result.error) {
      setStreamError(result.error);
      return;
    }

    if (result.streamId && result.assistantMessage) {
      activeStreamIdRef.current = result.streamId;
      setStreaming(true);
    } else if (!result.assistantMessage) {
      setStreamError(
        "Manual Mode is ready. Copy a Context Pack into any AI and paste the response back here. API providers are optional in Project tools.",
      );
      if (workspace) await refreshOpsPanels(workspace.id);
    }
  };

  const handleBuildContextPack = async (input: {
    userRequest: string;
    targetPlatform: string;
  }): Promise<UniversalContextPackResult> => {
    if (!workspace || !activeThread) {
      throw new Error("Open a thread before building a Context Pack.");
    }
    const result = await continuity.buildContextPack({
      workspaceId: workspace.id,
      threadId: activeThread.id,
      userRequest: input.userRequest,
      targetPlatform: input.targetPlatform,
    });
    await refreshOpsPanels(workspace.id);
    return result;
  };

  const handleSaveManualExchange = async (input: {
    userRequest: string;
    assistantResponse: string;
    targetPlatform: string;
  }) => {
    if (!workspace || !activeThread) {
      throw new Error("Open a thread before saving a manual exchange.");
    }
    await continuity.saveManualExchange({
      workspaceId: workspace.id,
      threadId: activeThread.id,
      userRequest: input.userRequest,
      assistantResponse: input.assistantResponse,
      targetPlatform: input.targetPlatform,
    });
    await reloadThreads(workspace.id);
    await loadThreadMessages(activeThread.id);
    await refreshOpsPanels(workspace.id);
  };

  const handleCancelStream = () => {
    const id = activeStreamIdRef.current;
    if (!id) return;
    void continuity.cancelMessageStream(id);
  };

  const openExternalUrl = (url: string) => {
    void continuity.openExternalUrl(url);
  };

  const handleSaveProvider = async (
    provider: string,
    model: string,
    apiKey: string,
    baseUrl: string,
  ) => {
    if (!workspace) return;
    try {
      const config = await continuity.saveProviderConfig(
        workspace.id,
        provider,
        model,
        apiKey,
        baseUrl || null,
      );
      setProviderConfig(config);
      setSettingsProviderId(undefined);
      await refreshOpsPanels(workspace.id);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[continuity] save provider failed", err);
      }
      throw err;
    }
  };

  const handleTestProvider = async (
    provider: string,
    model: string,
    apiKey: string,
    baseUrl: string,
  ) => {
    if (!workspace) {
      return {
        ok: false,
        status: "unknown_error" as const,
        message: "No workspace loaded.",
      };
    }
    return continuity.testProviderConnection(workspace.id, {
      apiKey: apiKey.trim() || undefined,
      provider,
      model,
      baseUrl: baseUrl.trim() || undefined,
    });
  };

  const handleRemoveProviderKey = async (provider: string) => {
    if (!workspace) return;
    const config = await continuity.removeProviderKey(workspace.id, provider);
    if (config) setProviderConfig(config);
    else setProviderConfig(null);
  };

  const handleCreateSnapshot = async (label: string) => {
    if (!workspace) return;
    await continuity.createSnapshot(
      workspace.id,
      label || undefined,
      activeThread?.id ?? null,
    );
    await refreshOpsPanels(workspace.id);
  };

  const handleSaveContinuitySummary = async (summary: string) => {
    if (!workspace) return;
    const updated = await continuity.updateContinuitySummary(workspace.id, summary);
    setWorkspace(updated);
    await refreshOpsPanels(workspace.id);
  };

  const isEncryptedBackupFile = (text: string): boolean => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return parsed.encryptedBackupFormatVersion != null && parsed.ciphertext != null;
    } catch {
      return false;
    }
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    if (isEncryptedBackupFile(text)) {
      setEncryptedImport({ json: text, fileName: file.name });
      return;
    }
    const preview = await continuity.previewWorkspaceImport(text);
    setImportJson(text);
    setImportPreview(preview);
  };

  const handleEncryptedImportFile = async (file: File) => {
    try {
      const text = await file.text();
      setEncryptedImport({ json: text, fileName: file.name });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not read the encrypted backup file.";
      setExportMessage(message);
      if (import.meta.env.DEV) {
        console.error("[continuity] encrypted import file read failed", err);
      }
    }
  };

  const openEncryptedImportPicker = () => {
    const input = encryptedImportInputRef.current;
    if (!input) {
      const message = "Import picker is not ready. Restart the app and try again.";
      setExportMessage(message);
      if (import.meta.env.DEV) {
        console.error("[continuity] encrypted import file input ref is missing");
      }
      return;
    }
    input.click();
  };

  const handleConfirmImport = async () => {
    if (!importJson) return;
    setImporting(true);
    try {
      const result = await continuity.importWorkspace(importJson);
      setExportMessage(result.message);
      if (result.ok && result.workspace) {
        await continuity.setActiveWorkspace(result.workspace.id);
        await loadWorkspace(result.workspace);
      }
    } finally {
      setImporting(false);
      setImportPreview(null);
      setImportJson(null);
    }
  };

  const handleAfterRestore = async () => {
    if (!workspace || !activeThread) return;
    await loadThreadMessages(activeThread.id);
    await refreshOpsPanels(workspace.id);
    await refreshAppState();
  };

  const handleEncryptedExport = () => {
    if (!workspace) {
      setExportMessage("Open a workspace before creating an encrypted backup.");
      return;
    }
    if (appState?.recoveryMode) {
      setExportMessage("Encrypted export is unavailable in recovery mode.");
      return;
    }
    setShowEncryptedExport(true);
  };

  const runEncryptedExportWithPassword = async (password: string) => {
    if (!workspace) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await continuity.exportWorkspaceEncrypted(
        workspace.id,
        password,
      );
      if (!result.ok || !result.json) {
        throw new Error(result.error ?? "Encrypted export could not be completed.");
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `continuity-encrypted-${workspace.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage("Encrypted backup saved locally.");
      setShowEncryptedExport(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Encrypted export failed.";
      setExportMessage(message);
      if (import.meta.env.DEV) {
        console.error("[continuity] encrypted export failed", err);
      }
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setExporting(false);
    }
  };

  const handleExport = async () => {
    if (!workspace) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await continuity.exportWorkspace(workspace.id);
      if (!result.ok || !result.json) {
        const warn =
          result.exportWarnings?.length
            ? ` Warnings: ${result.exportWarnings.join("; ")}`
            : "";
        setExportMessage((result.error ?? "Export could not be completed.") + warn);
        return;
      }
      const warnNote =
        result.exportWarnings && result.exportWarnings.length > 0
          ? ` (${result.exportWarnings.length} warning${result.exportWarnings.length > 1 ? "s" : ""})`
          : "";
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `continuity-export-${workspace.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage(`Workspace export saved${warnNote}.`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const providerSendEnabled =
    providerConfig != null &&
    isProviderConfigured(providerConfig) &&
    providerConfig.runtimeReady;
  const manualModeHint =
    "Manual Mode is ready. You can copy a Context Pack into any AI and paste the response back here. API providers are optional in Project tools.";
  const providerBadge = providerConfig
    ? `${providerConfig.displayName} · ${providerConfig.model}`
    : null;
  const modelBadge = providerSendEnabled ? providerConfig?.model ?? null : null;

  const providerPanelProps =
    workspace != null
      ? {
          workspaceId: workspace.id,
          initial: providerConfig,
          initialProviderId: settingsProviderId,
          onSave: handleSaveProvider,
          onTest: handleTestProvider,
          onRemoveKey: handleRemoveProviderKey,
          onOpenUrl: openExternalUrl,
        }
      : null;

  if (loading) {
    const phaseLabel =
      startupPhase === "migrating"
        ? "Applying database migrations…"
        : startupPhase === "loading"
          ? "Loading workspace…"
          : "Starting ContinuityOS…";
    return (
      <div className="app-shell loading">
        <p>{phaseLabel}</p>
        <p className="muted small">Local-first continuity — no cloud required.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {appState?.recoveryMode && (
        <RecoveryBanner message={appState.recoveryMessage ?? "Database unavailable"} />
      )}
      {appState?.previousSessionCrashed && (
        <div className="reliability-banner warn" role="status">
          <p>
            Previous session closed unexpectedly.
            {appState.reliabilityMessage?.includes("Recovery snapshot")
              ? " Recovery snapshot was preserved."
              : ""}
          </p>
        </div>
      )}
      {!appState?.recoveryMode && appState?.reliabilityMessage && !appState.previousSessionCrashed && (
        <div className="reliability-banner" role="status">
          <p>{appState.reliabilityMessage}</p>
        </div>
      )}
      {appState?.downgradeDetected && (
        <div className="reliability-banner warn" role="alert">
          <p>
            This database was created with a newer app version. Update ContinuityOS before
            making changes.
          </p>
        </div>
      )}
      {exportMessage && (
        <div className="reliability-banner" role="status">
          <p>{exportMessage}</p>
        </div>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="file-input-offscreen"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={encryptedImportInputRef}
        type="file"
        accept="application/json,.json"
        className="file-input-offscreen"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleEncryptedImportFile(file);
          e.target.value = "";
        }}
      />

      <WorkspaceHeader
        workspace={workspace}
        providerBadge={providerBadge}
        providerRuntimeReady={providerConfig?.runtimeReady ?? false}
        projectToolsOpen={showProjectTools}
        onToggleProjectTools={() => setShowProjectTools((value) => !value)}
      />

      <div className={`main-row${showProjectTools ? " with-tools" : " manual-first-layout"}`}>
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThread?.id ?? null}
          disabled={appState?.recoveryMode ?? false}
          showArchived={showArchivedThreads}
          showDeleted={showDeletedThreads}
          onToggleShowArchived={(value) => {
            setShowArchivedThreads(value);
            if (workspace) void reloadThreads(workspace.id, value, showDeletedThreads);
          }}
          onToggleShowDeleted={(value) => {
            setShowDeletedThreads(value);
            if (workspace) void reloadThreads(workspace.id, showArchivedThreads, value);
          }}
          onSelect={handleSelectThread}
          onCreate={handleCreateThread}
          onRename={handleRenameThread}
          onMoveUp={handleMoveThreadUp}
          onMoveDown={handleMoveThreadDown}
          onArchive={handleArchiveThread}
          onUnarchive={handleUnarchiveThread}
          onDelete={handleDeleteThread}
          onRestore={handleRestoreThread}
        />
        <ChatPanel
          thread={activeThread}
          messages={messages}
          switching={threadSwitching}
          totalCount={messageTotalCount}
          hasMoreOlder={hasMoreOlderMessages}
          loadingOlder={loadingOlderMessages}
          onLoadOlder={() => void handleLoadOlderMessages()}
          providerReady={providerSendEnabled}
          providerLabel={providerSendEnabled ? providerBadge : null}
          modelBadge={modelBadge}
          streaming={streaming}
          streamError={streamError}
          manualModeHint={manualModeHint}
          onSend={handleSendMessage}
          onBuildContextPack={handleBuildContextPack}
          onSaveManualExchange={handleSaveManualExchange}
          onCancelStream={handleCancelStream}
          disabled={appState?.recoveryMode ?? false}
        />
        {showProjectTools && (
          <OpsSidebar
            activeTab={opsTab}
            onTabChange={setOpsTab}
            onClose={() => setShowProjectTools(false)}
            appState={appState}
            autosaveStatus={autosaveStatus}
            workspaceHealth={workspaceHealth}
            healthLoading={healthLoading}
            timelineGroups={timelineGroups}
            snapshots={snapshots}
            workspaceId={workspace?.id ?? null}
            recoveryMode={appState?.recoveryMode ?? false}
            exporting={exporting}
            providerPanel={providerPanelProps}
            onImport={() => importInputRef.current?.click()}
            onImportEncrypted={openEncryptedImportPicker}
            onExport={() => void handleExport()}
            onEncryptedExport={handleEncryptedExport}
            onOpenDiagnostics={() => setShowDiagnostics(true)}
            onCreateSnapshot={handleCreateSnapshot}
            onRestorePreview={continuity.getRestorePreview}
            onRestore={continuity.restoreSnapshot}
            onRestored={handleAfterRestore}
            continuitySummary={workspace?.continuitySummary ?? null}
            onSaveContinuitySummary={handleSaveContinuitySummary}
          />
        )}
      </div>

      {showEncryptedExport && workspace && (
        <EncryptedExportDialog
          workspaceName={workspace.name}
          exporting={exporting}
          onClose={() => setShowEncryptedExport(false)}
          onExport={runEncryptedExportWithPassword}
        />
      )}

      {encryptedImport && (
        <EncryptedImportFlow
          json={encryptedImport.json}
          fileName={encryptedImport.fileName}
          onClose={() => setEncryptedImport(null)}
          onPreview={(json, password) =>
            continuity.previewEncryptedImport(json, password)
          }
          onConfirmImport={async (json, password) => {
            setImporting(true);
            try {
              const result = await continuity.importEncryptedWorkspace(
                json,
                password,
              );
              setExportMessage(result.message);
              if (result.ok && result.workspace) {
                await continuity.setActiveWorkspace(result.workspace.id);
                await loadWorkspace(result.workspace);
                setEncryptedImport(null);
              } else if (!result.ok) {
                throw new Error(result.message);
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Encrypted import failed.";
              setExportMessage(message);
              if (import.meta.env.DEV) {
                console.error("[continuity] encrypted import failed", err);
              }
              throw err instanceof Error ? err : new Error(message);
            } finally {
              setImporting(false);
            }
          }}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          importing={importing}
          onConfirm={() => void handleConfirmImport()}
          onClose={() => {
            setImportPreview(null);
            setImportJson(null);
          }}
        />
      )}

      {showDiagnostics && (
        <DiagnosticsPanel
          workspaceId={workspace?.id ?? null}
          onClose={() => setShowDiagnostics(false)}
        />
      )}

      <AppFooter appState={appState} />
    </div>
  );
}
