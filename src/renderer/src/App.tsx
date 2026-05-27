import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppState,
  AutosaveStatus,
  ContinuityImportApplyResult,
  EmbeddedLocalLlmStatus,
  ImportPreview,
  LocalAiStatus,
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
import {
  OpsSidebar,
  type OpsFocusTarget,
  type OpsTabId,
} from "./components/OpsSidebar";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { ThreadSidebar } from "./components/ThreadSidebar";
import { AppFooter } from "./components/AppFooter";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { EncryptedImportFlow } from "./components/EncryptedImportFlow";
import { EncryptedExportDialog } from "./components/EncryptedExportDialog";
import {
  buildManualFallbackState,
  type ManualFallbackState,
} from "./manual-fallback";
import {
  resolveGuidanceCard,
  transitionGuidanceState,
  type GuidanceCard,
  type GuidanceActionId,
  type GuidanceState,
} from "./guided-routines";
import {
  createChatWorkflowSession,
  getContextPackRequestHint,
  routeChatIntent,
  type ActiveChatWorkflow,
  type ChatWorkflowSession,
} from "./chat-workflows";
import { buildChatFailureCard, buildConversationalShellCard } from "./conversational-shell";

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
  const [manualFallback, setManualFallback] = useState<ManualFallbackState | null>(null);
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
  const [guidanceState, setGuidanceState] = useState<GuidanceState>("welcome");
  const [guidanceImportedSource, setGuidanceImportedSource] = useState<string | null>(null);
  const [chatWorkflow, setChatWorkflow] = useState<ChatWorkflowSession>(
    createChatWorkflowSession("none"),
  );
  const [chatWorkflowTick, setChatWorkflowTick] = useState(0);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [embeddedLocalAiStatus, setEmbeddedLocalAiStatus] =
    useState<EmbeddedLocalLlmStatus | null>(null);
  const [conversationalGuideCard, setConversationalGuideCard] = useState<GuidanceCard | null>(
    null,
  );
  const [opsFocusTarget, setOpsFocusTarget] = useState<OpsFocusTarget | null>(null);
  const [opsFocusTick, setOpsFocusTick] = useState(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const encryptedImportInputRef = useRef<HTMLInputElement>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const latestSentUserMessageIdRef = useRef<string | null>(null);
  const latestSentContentRef = useRef<string>("");

  const isProviderConfigured = (config: ProviderConfig | null) => {
    if (!config?.enabled) return false;
    return config.provider === "ollama";
  };

  const updateGuidance = useCallback(
    (state: GuidanceState, importedSource?: string | null) => {
      setGuidanceState(state);
      if (importedSource !== undefined) {
        setGuidanceImportedSource(importedSource);
      }
    },
    [],
  );

  const focusProjectTools = useCallback(
    (tab: OpsTabId, target: OpsFocusTarget) => {
      setShowProjectTools(true);
      setOpsTab(tab);
      setOpsFocusTarget(target);
      setOpsFocusTick((value) => value + 1);
    },
    [],
  );

  const openChatWorkflow = useCallback(
    (
      kind: ActiveChatWorkflow,
      options: Partial<Omit<ChatWorkflowSession, "kind">> = {},
    ) => {
      setChatWorkflow(createChatWorkflowSession(kind, options));
      setChatWorkflowTick((value) => value + 1);
    },
    [],
  );

  const closeChatWorkflow = useCallback(() => {
    setChatWorkflow(createChatWorkflowSession("none"));
    setChatWorkflowTick((value) => value + 1);
  }, []);

  const refreshAppState = useCallback(async () => {
    const state = await continuity.getAppState();
    setAppState(state);
    return state;
  }, []);

  const refreshLocalAiStatus = useCallback(
    async (workspaceId?: string | null): Promise<LocalAiStatus | null> => {
      const nextWorkspaceId = workspaceId ?? workspace?.id ?? null;
      if (!nextWorkspaceId) {
        setLocalAiStatus(null);
        return null;
      }
      const status = await continuity.getLocalAiStatus(nextWorkspaceId).catch(() => null);
      setLocalAiStatus(status);
      return status;
    },
    [workspace?.id],
  );

  const refreshEmbeddedLocalAiStatus = useCallback(async (): Promise<EmbeddedLocalLlmStatus | null> => {
    const status = await continuity.getEmbeddedLocalAiStatus().catch(() => null);
    setEmbeddedLocalAiStatus(status);
    return status;
  }, []);

  const openProjectToolsFromChat = useCallback(
    (target: OpsFocusTarget) => {
      if (target === "local-ai") {
        focusProjectTools("provider", target);
        return;
      }
      focusProjectTools("overview", target);
    },
    [focusProjectTools],
  );

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
        setManualFallback((prev) =>
          prev?.threadId === repair.thread?.id ? prev : null,
        );
      } else {
        setActiveThread(null);
        setMessages([]);
        setMessageTotalCount(0);
        setHasMoreOlderMessages(false);
        setOldestMessageCursor(null);
        setManualFallback(null);
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
      setManualFallback(null);
      setLocalAiStatus(null);
      setEmbeddedLocalAiStatus(null);
      setConversationalGuideCard(null);
      closeChatWorkflow();
      return;
    }
    const [config, nextLocalAiStatus, nextEmbeddedLocalAiStatus] = await Promise.all([
      continuity.getProviderConfig(ws.id),
      continuity.getLocalAiStatus(ws.id).catch(() => null),
      continuity.getEmbeddedLocalAiStatus().catch(() => null),
    ]);
    setProviderConfig(config);
    setLocalAiStatus(nextLocalAiStatus);
    setEmbeddedLocalAiStatus(nextEmbeddedLocalAiStatus);
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
    updateGuidance("welcome");
    setConversationalGuideCard(null);
    closeChatWorkflow();
  }, [closeChatWorkflow, refreshOpsPanels, loadThreadMessages, reloadThreads, updateGuidance]);

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

  const contextPackRequestHint = useMemo(
    () =>
      getContextPackRequestHint({
        messages,
        guidanceState,
        continuitySummary: workspace?.continuitySummary ?? null,
        importedSource: guidanceImportedSource,
      }),
    [guidanceImportedSource, guidanceState, messages, workspace?.continuitySummary],
  );

  const activeOllamaChat = useMemo(() => {
    const configuredModel =
      providerConfig?.provider === "ollama" ? providerConfig.model.trim() : "";
    const detectedModel = localAiStatus?.selectedModel?.trim() ?? "";
    const configuredBaseUrl =
      providerConfig?.provider === "ollama" ? providerConfig.baseUrl?.trim() ?? "" : "";
    const detectedBaseUrl = localAiStatus?.baseUrl?.trim() ?? "";
    const selected =
      localAiStatus?.selected === true ||
      (providerConfig?.provider === "ollama" && providerConfig.enabled);
    const model = detectedModel || configuredModel;
    const baseUrl = detectedBaseUrl || configuredBaseUrl;
    const ready =
      localAiStatus?.state === "ollama_ready" && selected && Boolean(model) && Boolean(baseUrl);

    return {
      baseUrl: baseUrl || null,
      model: model || null,
      ready,
      selected,
    };
  }, [localAiStatus, providerConfig]);

  const buildSendFailureGuide = useCallback(
    (error?: string | null) =>
      buildChatFailureCard({
        error,
        localAiState: localAiStatus?.state ?? null,
        providerReady: activeOllamaChat.ready,
        selectedModel: activeOllamaChat.model,
        baseUrl: activeOllamaChat.baseUrl,
      }),
    [
      activeOllamaChat.baseUrl,
      activeOllamaChat.model,
      activeOllamaChat.ready,
      localAiStatus?.state,
    ],
  );

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
        latestSentUserMessageIdRef.current = null;
        latestSentContentRef.current = "";
        setStreamError(null);
        setManualFallback(null);
        setConversationalGuideCard(null);
        updateGuidance("welcome");
        closeChatWorkflow();
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
        const fallback = activeThread
          ? buildManualFallbackState({
              threadId: activeThread.id,
              sourceMessageId: latestSentUserMessageIdRef.current,
              error: event.error,
              providerConfigured: isProviderConfigured(providerConfig),
            })
          : null;
        if (!event.cancelled) {
          if (fallback) {
            setManualFallback(fallback);
            setStreamError(null);
            setConversationalGuideCard(buildSendFailureGuide(event.error));
            if (!activeOllamaChat.ready) {
              updateGuidance(
                transitionGuidanceState(guidanceState, "message_saved_without_provider"),
              );
            }
          } else {
            setStreamError(event.error);
            setManualFallback(null);
            setConversationalGuideCard(null);
          }
        } else {
          setStreamError(null);
          setManualFallback(null);
          setConversationalGuideCard(null);
        }
        latestSentUserMessageIdRef.current = null;
        latestSentContentRef.current = "";
        if (workspace) void refreshOpsPanels(workspace.id);
      },
    });
    return cleanup;
  }, [
    activeOllamaChat.ready,
    activeThread,
    buildSendFailureGuide,
    closeChatWorkflow,
    guidanceState,
    providerConfig,
    refreshOpsPanels,
    updateGuidance,
    workspace,
    localAiStatus?.detected,
  ]);

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
    setManualFallback(null);
    updateGuidance("welcome");
    setConversationalGuideCard(null);
    closeChatWorkflow();
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
      setManualFallback((prev) => (prev?.threadId === thread.id ? prev : null));
      updateGuidance("welcome");
      setConversationalGuideCard(null);
      closeChatWorkflow();
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
    const localRoute = routeChatIntent(content, guidanceState);
    latestSentContentRef.current = content.trim();
    setStreamError(null);
    setManualFallback(null);
    setConversationalGuideCard(null);
    updateGuidance("welcome");
    closeChatWorkflow();

    const saveLocalMessage = async () => {
      const savedMessage = await continuity.saveLocalUserMessage({
        threadId: activeThread.id,
        content,
      });
      setMessages((prev) =>
        [...prev, savedMessage].filter(
          (message, index, list) => list.findIndex((item) => item.id === message.id) === index,
        ),
      );
      latestSentUserMessageIdRef.current = savedMessage.id;
      assistantMessageIdRef.current = null;
      activeStreamIdRef.current = null;
      setStreaming(false);
      if (workspace) {
        await reloadThreads(workspace.id);
        await refreshOpsPanels(workspace.id);
      }
      return savedMessage;
    };

    if (localRoute.kind !== "none") {
      const savedMessage = await saveLocalMessage();
      if (localRoute.kind === "guidance") {
        setConversationalGuideCard(
          buildConversationalShellCard({
            message: content,
            guidanceState,
            localAiDetected: localAiStatus?.detected ?? null,
            workspaceName: workspace?.name ?? null,
          }),
        );
        return;
      }
      const requestText =
        localRoute.workflow === "continue_any_ai"
          ? contextPackRequestHint
          : localRoute.workflow === "paste_ai_response"
            ? contextPackRequestHint
            : null;
      openChatWorkflow(localRoute.workflow, {
        sourceUserMessageId: savedMessage.id,
        requestText,
      });
      return;
    }

    if (import.meta.env.DEV) {
      console.info("[continuity] chat send route", {
        activeEngine: activeOllamaChat.ready ? "ollama" : "guide",
        selectedModel: activeOllamaChat.model,
        baseUrl: activeOllamaChat.baseUrl,
        route: activeOllamaChat.ready ? "ollama" : "guide",
      });
    }

    if (
      workspace &&
      activeOllamaChat.ready &&
      (
        providerConfig?.provider !== "ollama" ||
        !providerConfig.enabled ||
        providerConfig.model.trim() !== activeOllamaChat.model ||
        (providerConfig.baseUrl?.trim() ?? "") !== activeOllamaChat.baseUrl
      )
    ) {
      const syncedConfig = await continuity.saveProviderConfig(
        workspace.id,
        "ollama",
        activeOllamaChat.model ?? "",
        "",
        activeOllamaChat.baseUrl,
      );
      setProviderConfig(syncedConfig);
    }

    if (!activeOllamaChat.ready) {
      await saveLocalMessage();
      updateGuidance(transitionGuidanceState(guidanceState, "message_saved_without_provider"));
      setConversationalGuideCard(
        buildConversationalShellCard({
          message: content,
          guidanceState,
          localAiDetected: localAiStatus?.detected ?? null,
          workspaceName: workspace?.name ?? null,
        }),
      );
      return;
    }

    const result = await continuity.startMessageStream({
      threadId: activeThread.id,
      content,
    });

    const next: Message[] = [];
    if (result.userMessage) {
      next.push(result.userMessage);
      latestSentUserMessageIdRef.current = result.userMessage.id;
    }
    if (result.assistantMessage) {
      next.push(result.assistantMessage);
      assistantMessageIdRef.current = result.assistantMessage.id;
    }
    if (next.length > 0) {
      setMessages((prev) => [...prev, ...next.filter((m) => !prev.some((p) => p.id === m.id))]);
    }

    if (result.error) {
      const fallback = buildManualFallbackState({
        threadId: activeThread.id,
        sourceMessageId: result.userMessage?.id ?? null,
        error: result.error,
        providerConfigured: isProviderConfigured(providerConfig),
      });
      if (fallback) {
        setManualFallback(fallback);
        if (!activeOllamaChat.ready) {
          updateGuidance(
            transitionGuidanceState(guidanceState, "message_saved_without_provider"),
          );
        }
        setConversationalGuideCard(buildSendFailureGuide(result.error));
      } else {
        setStreamError(result.error);
      }
      if (workspace) await refreshOpsPanels(workspace.id);
      return;
    }

    if (result.streamId && result.assistantMessage) {
      activeStreamIdRef.current = result.streamId;
      setStreaming(true);
    } else if (!result.assistantMessage) {
      const fallback = buildManualFallbackState({
        threadId: activeThread.id,
        sourceMessageId: result.userMessage?.id ?? null,
        providerConfigured: isProviderConfigured(providerConfig),
      });
      if (fallback) {
        setManualFallback(fallback);
        if (!activeOllamaChat.ready) {
          updateGuidance(
            transitionGuidanceState(guidanceState, "message_saved_without_provider"),
          );
        }
        setConversationalGuideCard(buildSendFailureGuide());
      }
      if (workspace) await refreshOpsPanels(workspace.id);
    }
  };

  const handleBuildContextPack = async (input: {
    userRequest: string;
    targetPlatform: string;
  }): Promise<UniversalContextPackResult> => {
    if (!workspace || !activeThread) {
      throw new Error("Open a thread before building an advanced AI handoff.");
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

  const handleSaveManualAssistantResponse = async (input: {
    assistantResponse: string;
    targetPlatform: string;
    sourceUserMessageId?: string;
  }) => {
    if (!workspace || !activeThread) {
      throw new Error("Open a thread before saving a manual AI response.");
    }
    await continuity.saveManualAssistantResponse({
      workspaceId: workspace.id,
      threadId: activeThread.id,
      assistantResponse: input.assistantResponse,
      targetPlatform: input.targetPlatform,
      sourceUserMessageId: input.sourceUserMessageId,
    });
    await reloadThreads(workspace.id);
    await loadThreadMessages(activeThread.id);
    setManualFallback(null);
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
    if (provider !== "ollama") {
      throw new Error("Ollama is the only in-app chat engine enabled in this build.");
    }
    try {
      const config = await continuity.saveProviderConfig(
        workspace.id,
        provider,
        model,
        apiKey,
        baseUrl || null,
      );
      setProviderConfig(config);
      await refreshOpsPanels(workspace.id);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[continuity] save provider failed", err);
      }
      throw err;
    }
  };

  const handleUseLocalAi = useCallback(
    async (input: { model: string; baseUrl: string }) => {
      if (!workspace) {
        throw new Error("Open a workspace before enabling Local AI.");
      }
      await handleSaveProvider("ollama", input.model, "", input.baseUrl);
      const status = await refreshLocalAiStatus(workspace.id);
      if (status?.detected) {
        updateGuidance("local_ai_available");
      }
      setConversationalGuideCard(null);
      return status;
    },
    [handleSaveProvider, refreshLocalAiStatus, updateGuidance, workspace],
  );

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
    if (provider !== "ollama") {
      return {
        ok: false,
        status: "adapter_not_ready" as const,
        message: "Ollama is the only in-app chat engine enabled in this build.",
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

  const handleContinuityImported = async (result: ContinuityImportApplyResult) => {
    setExportMessage(result.message);
    setConversationalGuideCard(null);
    updateGuidance(
      transitionGuidanceState(guidanceState, "memory_imported"),
      result.sourceAi || null,
    );
    setShowProjectTools(false);
    if (result.workspace) {
      await continuity.setActiveWorkspace(result.workspace.id);
      await loadWorkspace(result.workspace);
      updateGuidance("memory_imported", result.sourceAi || null);
      closeChatWorkflow();
      return;
    }
    if (workspace) {
      await refreshOpsPanels(workspace.id);
    }
    closeChatWorkflow();
  };

  const handleApplyWorkflowImport = async (input: {
    text: string;
    mode: "update-current" | "create-workspace" | "checkpoint-only";
  }) => {
    const result = await continuity.applyContinuityImport({
      text: input.text,
      mode: input.mode,
      workspaceId: workspace?.id ?? undefined,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    await handleContinuityImported(result);
    return result;
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

  const providerSendEnabled = activeOllamaChat.ready;
  const providerBadge = providerSendEnabled
    ? `Ollama local AI · ${activeOllamaChat.model ?? "UNKNOWN"}`
    : null;
  const modelBadge = providerSendEnabled ? activeOllamaChat.model ?? null : null;
  const ollamaStatusLabel =
    providerSendEnabled && activeOllamaChat.model
      ? `Ollama local AI · ${activeOllamaChat.model}`
      : localAiStatus?.state === "ollama_ready"
        ? "Ollama detected · select a model to chat"
        : localAiStatus?.state === "ollama_detected_no_model"
          ? "Ollama detected · no model available yet"
          : localAiStatus?.state === "ollama_error"
            ? "Ollama error"
            : "Ollama not connected";

  const providerPanelProps =
    workspace != null
      ? {
          workspaceId: workspace.id,
          initial: providerConfig,
          onSave: handleSaveProvider,
          onTest: handleTestProvider,
          onRemoveKey: handleRemoveProviderKey,
          onOpenUrl: openExternalUrl,
        }
      : null;

  const guidanceCard = resolveGuidanceCard(guidanceState, {
    importedSource: guidanceImportedSource,
    localAiDetected: localAiStatus?.detected ?? null,
    providerReady: providerSendEnabled,
  });
  const activeGuidanceCard = conversationalGuideCard ?? guidanceCard;

  const handleGuideAction = useCallback(
    (action: GuidanceActionId) => {
      setConversationalGuideCard(null);
      if (action === "help") {
        setConversationalGuideCard(
          buildConversationalShellCard({
            message: "help",
            guidanceState,
            localAiDetected: localAiStatus?.detected ?? null,
            workspaceName: workspace?.name ?? null,
          }),
        );
        return;
      }
      if (action === "import_memory") {
        openChatWorkflow("import_memory");
        return;
      }
      if (action === "review_project_memory") {
        openChatWorkflow("review_memory");
        return;
      }
      if (action === "backup_export") {
        openChatWorkflow("backup_export");
        updateGuidance(transitionGuidanceState(guidanceState, "backup_recommended"));
        return;
      }
      if (action === "create_memory_update") {
        openChatWorkflow("create_memory_update");
        return;
      }
      if (action === "set_up_local_ai") {
        openChatWorkflow("setup_local_ai");
        return;
      }
      if (action === "continue_any_ai") {
        openChatWorkflow("continue_any_ai", { requestText: contextPackRequestHint });
      }
    },
    [
      contextPackRequestHint,
      guidanceState,
      localAiStatus?.detected,
      openChatWorkflow,
      updateGuidance,
      workspace?.name,
    ],
  );

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
        ollamaStatusLabel={ollamaStatusLabel}
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
          workspaceId={workspace?.id ?? null}
          workspaceName={workspace?.name ?? null}
          continuitySummary={workspace?.continuitySummary ?? null}
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
          manualFallback={manualFallback}
          onSend={handleSendMessage}
          onBuildContextPack={handleBuildContextPack}
          onSaveManualAssistantResponse={handleSaveManualAssistantResponse}
          onCancelStream={handleCancelStream}
          guidanceCard={activeGuidanceCard}
          hasConversationalGuide={conversationalGuideCard != null}
          chatWorkflow={chatWorkflow}
          chatWorkflowTick={chatWorkflowTick}
          contextPackRequestHint={contextPackRequestHint}
          onGuideAction={handleGuideAction}
          onOpenWorkflow={openChatWorkflow}
          onCloseWorkflow={closeChatWorkflow}
          onOpenProjectTools={openProjectToolsFromChat}
          onApplyContinuityImport={handleApplyWorkflowImport}
          onContextPackCopied={() =>
            updateGuidance(transitionGuidanceState(guidanceState, "context_pack_copied"))
          }
          onManualResponseSaved={() =>
            updateGuidance(transitionGuidanceState(guidanceState, "manual_response_saved"))
          }
          onRefreshLocalAiStatus={() => refreshLocalAiStatus(workspace?.id)}
          onRefreshEmbeddedLocalAiStatus={refreshEmbeddedLocalAiStatus}
          onPreviewMemoryCompression={() =>
            continuity.previewMemoryCompression({
              workspaceId: workspace?.id ?? "",
              threadId: activeThread?.id ?? null,
            })
          }
          onUseLocalAi={handleUseLocalAi}
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
            threadId={activeThread?.id ?? null}
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
            onContinuityImported={handleContinuityImported}
            focusTarget={opsFocusTarget}
            focusTick={opsFocusTick}
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
