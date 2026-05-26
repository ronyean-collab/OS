import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContinuityImportApplyResult,
  ContinuityImportMode,
  ContinuityImportPreview,
  EmbeddedLocalLlmStatus,
  LocalAiStatus,
  MarkdownMemoryExportResult,
  MarkdownMemoryFileType,
  MarkdownMemoryRecordSummary,
  MemoryCompressionDraft,
  Message,
  UniversalContextPackResult,
} from "@shared/types";
import {
  getChatWorkflowDefinition,
  summarizeImportPreview,
  type ActiveChatWorkflow,
  type ChatWorkflowSession,
} from "../chat-workflows";

type ProjectToolsTarget =
  | "import-memory"
  | "review-memory"
  | "backup-export"
  | "memory-update"
  | "local-ai";

type Props = {
  workflow: ChatWorkflowSession;
  workflowTick: number;
  workspaceId: string | null;
  workspaceName: string | null;
  threadId: string | null;
  latestUserMessage: Message | null;
  continuitySummary: string | null;
  requestTextHint: string;
  disabled: boolean;
  streaming: boolean;
  onClose: () => void;
  onOpenWorkflow: (
    workflow: ActiveChatWorkflow,
    options?: Partial<Omit<ChatWorkflowSession, "kind">>,
  ) => void;
  onOpenProjectTools: (target: ProjectToolsTarget) => void;
  onApplyContinuityImport: (input: {
    text: string;
    mode: ContinuityImportMode;
  }) => Promise<ContinuityImportApplyResult>;
  onBuildContextPack: (input: {
    userRequest: string;
    targetPlatform: string;
  }) => Promise<UniversalContextPackResult>;
  onSaveManualAssistantResponse: (input: {
    assistantResponse: string;
    targetPlatform: string;
    sourceUserMessageId?: string;
  }) => Promise<void>;
  onContextPackCopied: () => void;
  onManualResponseSaved: () => void;
  onRefreshLocalAiStatus: () => Promise<LocalAiStatus | null>;
  onRefreshEmbeddedLocalAiStatus: () => Promise<EmbeddedLocalLlmStatus | null>;
  onPreviewMemoryCompression: () => Promise<MemoryCompressionDraft>;
  onUseLocalAi: (input: {
    model: string;
    baseUrl: string;
  }) => Promise<LocalAiStatus | null>;
};

const TARGET_OPTIONS = ["AI Handoff", "ChatGPT", "Claude", "Gemini", "Other AI"];

function triggerMarkdownDownload(fileName: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ChatWorkflowPanel({
  workflow,
  workflowTick,
  workspaceId,
  workspaceName,
  threadId,
  latestUserMessage,
  continuitySummary,
  requestTextHint,
  disabled,
  streaming,
  onClose,
  onOpenWorkflow,
  onOpenProjectTools,
  onApplyContinuityImport,
  onBuildContextPack,
  onSaveManualAssistantResponse,
  onContextPackCopied,
  onManualResponseSaved,
  onRefreshLocalAiStatus,
  onRefreshEmbeddedLocalAiStatus,
  onPreviewMemoryCompression,
  onUseLocalAi,
}: Props) {
  if (!workflow || workflow.kind === "none") {
    return null;
  }

  const continuity = typeof window === "undefined" ? undefined : window.continuity;
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ContinuityImportPreview | null>(null);

  const [contextPack, setContextPack] = useState<UniversalContextPackResult | null>(null);
  const [showContextPackPreview, setShowContextPackPreview] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState(workflow.targetPlatform || "AI Handoff");

  const [assistantResponse, setAssistantResponse] = useState("");
  const [memoryRecord, setMemoryRecord] = useState<MarkdownMemoryRecordSummary | null>(null);
  const [memoryPreview, setMemoryPreview] = useState<ContinuityImportPreview | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<MemoryCompressionDraft | null>(null);

  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [localAiModel, setLocalAiModel] = useState("");
  const [embeddedLocalAiStatus, setEmbeddedLocalAiStatus] =
    useState<EmbeddedLocalLlmStatus | null>(null);
  const pasteResponseRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setWorkflowStatus(workflow.note);
    setWorkflowError(null);
    setBusyLabel(null);

    if (
      workflow.kind !== "import_memory" &&
      workflow.kind !== "import_memory_preview"
    ) {
      setImportText("");
      setImportPreview(null);
    }

    if (workflow.kind !== "continue_any_ai") {
      setContextPack(null);
      setShowContextPackPreview(false);
    }

    if (workflow.kind !== "paste_ai_response") {
      setAssistantResponse("");
    }

    if (workflow.kind !== "review_memory") {
      setMemoryRecord(null);
      setMemoryPreview(null);
      setMemoryLoading(false);
    }

    if (workflow.kind !== "create_memory_update") {
      setMemoryDraft(null);
    }

    if (workflow.kind !== "setup_local_ai") {
      setLocalAiStatus(null);
      setLocalAiModel("");
      setEmbeddedLocalAiStatus(null);
    }

    setTargetPlatform(workflow.targetPlatform || "AI Handoff");
  }, [workflow.kind, workflow.note, workflow.targetPlatform, workflowTick]);

  useEffect(() => {
    if (workflow.kind === "paste_ai_response") {
      window.setTimeout(() => pasteResponseRef.current?.focus(), 0);
    }
  }, [workflow.kind, workflowTick]);

  useEffect(() => {
    if (workflow.kind !== "review_memory" || !workspaceId || !continuity) {
      return;
    }

    const loadMemory = async () => {
      setMemoryLoading(true);
      try {
        const records = await continuity.listMarkdownMemoryRecords(workspaceId);
        const latest = records[0] ?? null;
        setMemoryRecord(latest);
        if (latest?.rawMarkdown?.trim()) {
          setMemoryPreview(await continuity.previewContinuityImport(latest.rawMarkdown));
        } else {
          setMemoryPreview(null);
        }
      } catch (error) {
        setWorkflowError(
          error instanceof Error ? error.message : "Could not load project memory.",
        );
      } finally {
        setMemoryLoading(false);
      }
    };

    void loadMemory();
  }, [continuity, workspaceId, workflow.kind, workflowTick]);

  useEffect(() => {
    if (workflow.kind !== "setup_local_ai") {
      return;
    }

    void refreshLocalAi();
  }, [workflow.kind, workflowTick]);

  useEffect(() => {
    if (workflow.kind !== "create_memory_update") {
      return;
    }

    void previewMemoryCompression();
  }, [workflow.kind, workflowTick]);

  const activeRequest = useMemo(() => {
    const explicit = workflow.requestText?.trim();
    if (explicit) return explicit;
    const latestMessage = latestUserMessage?.content.trim();
    if (latestMessage) return latestMessage;
    return requestTextHint.trim();
  }, [latestUserMessage?.content, requestTextHint, workflow.requestText]);

  async function refreshLocalAi() {
    setBusyLabel("Checking local AI...");
    setWorkflowError(null);
    try {
      const next = await onRefreshLocalAiStatus();
      setLocalAiStatus(next);
      const nextModel = next?.selectedModel ?? next?.models?.[0] ?? "";
      setLocalAiModel(nextModel);
      setWorkflowStatus(next?.message ?? "Local AI status refreshed.");
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not refresh Local AI status.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function refreshEmbeddedLocalAi() {
    setWorkflowError(null);
    try {
      const next = await onRefreshEmbeddedLocalAiStatus();
      setEmbeddedLocalAiStatus(next);
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not load Built-in Local AI status.",
      );
    }
  }

  async function previewMemoryCompression() {
    setBusyLabel("Creating memory update...");
    setWorkflowError(null);
    try {
      const draft = await onPreviewMemoryCompression();
      setMemoryDraft(draft);
      setWorkflowStatus(
        "Memory update preview ready. Review the markdown below before copying or applying anything.",
      );
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not build the memory update preview.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function exportMarkdown(fileType: MarkdownMemoryFileType, copyOnly = false) {
    if (!workspaceId || !continuity) return;
    setBusyLabel(copyOnly ? "Copying markdown..." : "Exporting markdown...");
    setWorkflowError(null);
    try {
      const result: MarkdownMemoryExportResult = await continuity.exportMarkdownMemory({
        workspaceId,
        threadId: threadId ?? undefined,
        fileType,
      });
      if (copyOnly) {
        await navigator.clipboard.writeText(result.markdown);
        setWorkflowStatus(`${result.fileName} copied to the clipboard.`);
      } else {
        triggerMarkdownDownload(result.fileName, result.markdown);
        setWorkflowStatus(`${result.fileName} exported.`);
      }
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not export markdown memory.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handlePreviewImport() {
    if (!continuity || !importText.trim()) return;
    setBusyLabel("Previewing import...");
    setWorkflowError(null);
    try {
      const preview = await continuity.previewContinuityImport(importText);
      setImportPreview(preview);
      if (!preview.valid) {
        setWorkflowError(preview.errors[0] ?? "Import preview is not valid yet.");
        return;
      }
      setWorkflowStatus(
        `I found project memory from ${preview.source}. Review it below before applying anything.`,
      );
      onOpenWorkflow("import_memory_preview", {
        sourceUserMessageId: workflow.sourceUserMessageId,
      });
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not preview the markdown memory file.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleApplyImport(mode: ContinuityImportMode) {
    if (!importText.trim() || !importPreview?.valid) return;
    setBusyLabel("Applying import...");
    setWorkflowError(null);
    try {
      await onApplyContinuityImport({ text: importText, mode });
      setImportPreview(null);
      setImportText("");
      onClose();
      setWorkflowStatus(
        "Memory imported. Start Ollama to answer here, or open Backup / Export if you need an advanced handoff.",
      );
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not apply the markdown memory file.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function ensureContextPack(): Promise<UniversalContextPackResult> {
    const built =
      contextPack ??
      (await onBuildContextPack({
        userRequest: activeRequest,
        targetPlatform,
      }));
    setContextPack(built);
    return built;
  }

  async function handleCopyContextPack() {
    setBusyLabel("Building AI handoff...");
    setWorkflowError(null);
    try {
      const built = await ensureContextPack();
      await navigator.clipboard.writeText(built.text);
      setWorkflowStatus(
        `Advanced handoff copied. Paste it into ${built.targetPlatform}, then paste the reply back here and I will save it to this thread.`,
      );
      onContextPackCopied();
      onOpenWorkflow("paste_ai_response", {
        sourceUserMessageId: workflow.sourceUserMessageId,
        requestText: activeRequest,
        targetPlatform,
        note:
          "The advanced handoff is copied. Paste it into another AI, then paste the reply back here.",
      });
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not copy the AI handoff.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleToggleContextPackPreview() {
    if (showContextPackPreview) {
      setShowContextPackPreview(false);
      return;
    }
    setBusyLabel("Preparing preview...");
    setWorkflowError(null);
    try {
      await ensureContextPack();
      setShowContextPackPreview(true);
      setWorkflowStatus("Advanced handoff preview is ready below.");
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not build the AI handoff preview.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleSaveManualResponse() {
    if (!assistantResponse.trim()) return;
    setBusyLabel("Saving response...");
    setWorkflowError(null);
    try {
      await onSaveManualAssistantResponse({
        assistantResponse,
        targetPlatform,
        sourceUserMessageId:
          workflow.sourceUserMessageId ?? latestUserMessage?.id ?? undefined,
      });
      onManualResponseSaved();
      setAssistantResponse("");
      onClose();
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not save the pasted AI response.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCopyMemoryUpdate() {
    if (!memoryDraft) return;
    setWorkflowError(null);
    try {
      await navigator.clipboard.writeText(memoryDraft.markdown);
      setWorkflowStatus("Memory update copied. Save it as a .md file, or apply it here.");
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not copy the memory update markdown.",
      );
    }
  }

  async function handleApplyMemoryUpdate(mode: ContinuityImportMode) {
    if (!memoryDraft?.markdown?.trim()) return;
    setBusyLabel("Applying memory update...");
    setWorkflowError(null);
    try {
      await onApplyContinuityImport({ text: memoryDraft.markdown, mode });
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not apply the memory update.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleUseLocalAi() {
    if (!localAiStatus?.detected || !localAiModel.trim()) return;
    setBusyLabel("Enabling Local AI...");
    setWorkflowError(null);
    try {
      await onUseLocalAi({
        model: localAiModel,
        baseUrl: localAiStatus.baseUrl,
      });
      setWorkflowStatus(
        `Local AI is ready with ${localAiModel}. You can keep chatting here without API credits.`,
      );
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : "Could not enable Local AI.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  const definition = getChatWorkflowDefinition(workflow.kind as ActiveChatWorkflow);
  const importSummary = importPreview ? summarizeImportPreview(importPreview) : null;

  return (
    <article className="message-bubble message-guide chat-workflow-panel" aria-live="polite">
      <div className="message-meta">
        <span>ContinuityOS Guide</span>
        <span className="local-guidance-badge">Workflow</span>
      </div>
      <h3 className="guide-card-title">{definition.title}</h3>
      <p>{definition.prompt}</p>
      {workflowStatus && <p className="muted small">{workflowStatus}</p>}

      {(workflow.kind === "import_memory" || workflow.kind === "import_memory_preview") && (
        <div className="chat-workflow-stack">
          <label className="chat-workflow-field">
            <span>Markdown memory file</span>
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                if (workflow.kind === "import_memory_preview") {
                  setImportPreview(null);
                  onOpenWorkflow("import_memory", {
                    sourceUserMessageId: workflow.sourceUserMessageId,
                  });
                }
              }}
              rows={12}
              disabled={disabled || streaming || busyLabel != null}
              placeholder={definition.inputPlaceholder ?? undefined}
            />
          </label>
          <div className="chat-workflow-actions">
            <button
              type="button"
              className="secondary"
              disabled={disabled || streaming || busyLabel != null || !importText.trim()}
              onClick={() => void handlePreviewImport()}
            >
              {busyLabel === "Previewing import..." ? "Previewing..." : "Preview Import"}
            </button>
            <button type="button" className="secondary small-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
          {importSummary && (
            <section className="chat-workflow-preview">
              <h4>Import preview</h4>
              <dl className="continuity-import-stats">
                <dt>Source</dt>
                <dd>{importSummary.source}</dd>
                <dt>Project</dt>
                <dd>{importSummary.projectName}</dd>
                <dt>Current objective</dt>
                <dd>{importSummary.currentObjective}</dd>
                <dt>Continuity summary</dt>
                <dd>{importSummary.continuitySummary}</dd>
                <dt>Stable facts</dt>
                <dd>
                  {importSummary.stableFactsCount}
                  {importSummary.stableFactsExample
                    ? ` - ${importSummary.stableFactsExample}`
                    : ""}
                </dd>
                <dt>Decisions</dt>
                <dd>
                  {importSummary.decisionsCount}
                  {importSummary.decisionsExample
                    ? ` - ${importSummary.decisionsExample}`
                    : ""}
                </dd>
                <dt>Open issues</dt>
                <dd>
                  {importSummary.openIssuesCount}
                  {importSummary.openIssuesExample
                    ? ` - ${importSummary.openIssuesExample}`
                    : ""}
                </dd>
                <dt>Next steps</dt>
                <dd>
                  {importSummary.nextStepsCount}
                  {importSummary.nextStepsExample
                    ? ` - ${importSummary.nextStepsExample}`
                    : ""}
                </dd>
              </dl>
              <div className="chat-workflow-actions">
                <button
                  type="button"
                  disabled={disabled || busyLabel != null || !importPreview?.valid || !workspaceId}
                  onClick={() => void handleApplyImport("update-current")}
                >
                  Apply to Current Workspace
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled || busyLabel != null || !importPreview?.valid || !workspaceId}
                  onClick={() => void handleApplyImport("checkpoint-only")}
                >
                  Save as Checkpoint Only
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled || busyLabel != null || !importPreview?.valid}
                  onClick={() => void handleApplyImport("create-workspace")}
                >
                  Create New Workspace
                </button>
                <button type="button" className="secondary small-btn" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {workflow.kind === "continue_any_ai" && (
        <div className="chat-workflow-stack">
          <label className="chat-workflow-field">
            <span>External target</span>
            <select
              value={targetPlatform}
              onChange={(event) => setTargetPlatform(event.target.value)}
              disabled={disabled || streaming || busyLabel != null}
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">
            Using current request: <span className="mono">{activeRequest}</span>
          </p>
          <div className="chat-workflow-actions">
            <button
              type="button"
              disabled={disabled || streaming || busyLabel != null || !activeRequest}
              onClick={() => void handleCopyContextPack()}
            >
              {busyLabel === "Building AI handoff..." ? "Preparing..." : "Copy Project Handoff"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || streaming || busyLabel != null || !activeRequest}
              onClick={() => void handleToggleContextPackPreview()}
            >
              {showContextPackPreview ? "Hide Preview" : "Show Preview"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onOpenWorkflow("paste_ai_response", {
                  sourceUserMessageId: workflow.sourceUserMessageId,
                  requestText: activeRequest,
                  targetPlatform,
                })
              }
            >
              Paste AI Response
            </button>
          </div>
          <div className="chat-workflow-preview">
            <h4>What this will include</h4>
            <ul className="chat-workflow-list">
              <li>Workspace: {workspaceName ?? "Current workspace"}</li>
              <li>Continuity summary: {continuitySummary?.trim() ? "Included" : "Not saved yet"}</li>
              <li>Markdown memory / project state: {memoryRecord ? "Included when available" : "Included when available"}</li>
              <li>
                Recent saved messages:
                {contextPack
                  ? ` ${contextPack.includedRecentMessageCount}${
                      contextPack.truncatedOlderMessages ? " (older history omitted for size)" : ""
                    }`
                  : " will be included automatically"}
              </li>
            </ul>
          </div>
          {showContextPackPreview && contextPack && (
            <label className="chat-workflow-field">
              <span>Project handoff preview</span>
              <textarea readOnly rows={14} value={contextPack.text} />
            </label>
          )}
        </div>
      )}

      {workflow.kind === "paste_ai_response" && (
        <div className="chat-workflow-stack">
          <label className="chat-workflow-field">
            <span>Response source</span>
            <select
              value={targetPlatform}
              onChange={(event) => setTargetPlatform(event.target.value)}
              disabled={disabled || busyLabel != null}
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="chat-workflow-field">
            <span>Paste AI response</span>
            <textarea
              ref={pasteResponseRef}
              value={assistantResponse}
              onChange={(event) => setAssistantResponse(event.target.value)}
              rows={9}
              disabled={disabled || busyLabel != null}
              placeholder={definition.inputPlaceholder ?? undefined}
            />
          </label>
          <div className="chat-workflow-actions">
            <button
              type="button"
              disabled={disabled || busyLabel != null || !assistantResponse.trim()}
              onClick={() => void handleSaveManualResponse()}
            >
              {busyLabel === "Saving response..." ? "Saving..." : "Save Response"}
            </button>
            <button type="button" className="secondary small-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {workflow.kind === "review_memory" && (
        <div className="chat-workflow-stack">
          <section className="chat-workflow-preview">
            <h4>Visible memory levels</h4>
            <ul className="chat-workflow-list">
              <li>raw_messages</li>
              <li>thread_summary</li>
              <li>project_state</li>
              <li>workspace_memory</li>
            </ul>
          </section>
          {memoryLoading ? (
            <p className="muted small">Loading saved project memory...</p>
          ) : memoryPreview ? (
            <section className="chat-workflow-preview">
              <h4>Latest project memory</h4>
              <dl className="continuity-import-stats">
                <dt>Current objective</dt>
                <dd>{memoryPreview.currentObjective}</dd>
                <dt>Continuity summary</dt>
                <dd>{memoryPreview.continuitySummary}</dd>
                <dt>Stable facts</dt>
                <dd>{memoryPreview.stableFacts.length}</dd>
                <dt>Example</dt>
                <dd>{memoryPreview.stableFacts[0] ?? "None saved yet"}</dd>
                <dt>Decisions</dt>
                <dd>{memoryPreview.decisionsMade.length}</dd>
                <dt>Example</dt>
                <dd>{memoryPreview.decisionsMade[0] ?? "None saved yet"}</dd>
                <dt>Open issues</dt>
                <dd>{memoryPreview.openIssues.length}</dd>
                <dt>Example</dt>
                <dd>{memoryPreview.openIssues[0] ?? "None saved yet"}</dd>
                <dt>Next steps</dt>
                <dd>{memoryPreview.nextSteps.length}</dd>
                <dt>Example</dt>
                <dd>{memoryPreview.nextSteps[0] ?? "None saved yet"}</dd>
              </dl>
            </section>
          ) : (
            <section className="chat-workflow-preview">
              <h4>No saved markdown memory yet</h4>
              <p className="muted small">
                ContinuityOS will not invent project memory. Import a markdown memory file or export
                one after more progress if you want a structured memory record.
              </p>
              {continuitySummary?.trim() && (
                <p className="muted small">
                  Current continuity summary: <span className="mono">{continuitySummary.trim()}</span>
                </p>
              )}
            </section>
          )}
          <div className="chat-workflow-actions">
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null || !workspaceId}
              onClick={() => void exportMarkdown("project-state")}
            >
              Export Project State .md
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null || !workspaceId}
              onClick={() =>
                onOpenWorkflow("import_memory", {
                  sourceUserMessageId: workflow.sourceUserMessageId,
                })
              }
            >
              Import Updated Memory
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null}
              onClick={() =>
                onOpenWorkflow("continue_any_ai", {
                  sourceUserMessageId: workflow.sourceUserMessageId,
                  requestText: requestTextHint,
                })
              }
            >
              Advanced AI Handoff
            </button>
          </div>
        </div>
      )}

      {workflow.kind === "backup_export" && (
        <div className="chat-workflow-stack">
          <div className="chat-workflow-actions">
            <button
              type="button"
              disabled={disabled || busyLabel != null || !workspaceId}
              onClick={() => void exportMarkdown("project-state")}
            >
              Export Project State .md
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null || !workspaceId}
              onClick={() => void exportMarkdown("ai-handoff")}
            >
              Export AI Handoff .md
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null || !workspaceId}
              onClick={() => onOpenProjectTools("backup-export")}
            >
              Open Full Backup Tools
            </button>
          </div>
          <p className="muted small">
            If you only need a portable markdown memory file, the export buttons above keep you in
            chat. Export AI Handoff .md is the advanced external handoff option. Use Full Backup
            Tools for the larger workspace backup.
          </p>
        </div>
      )}

      {workflow.kind === "create_memory_update" && (
        <div className="chat-workflow-stack">
          <section className="chat-workflow-preview">
            <h4>Memory levels</h4>
            <ul className="chat-workflow-list">
              {(memoryDraft?.levels ?? []).map((level) => (
                <li key={level}>{level}</li>
              ))}
            </ul>
            <p className="muted small">
              Raw messages stay intact. This draft compresses the latest visible state into a
              reviewable markdown project-state file.
            </p>
            <p className="muted small">
              Source messages: {memoryDraft?.sourceMessageCount ?? 0} · timeline events:{" "}
              {memoryDraft?.sourceTimelineEventCount ?? 0}
              {memoryDraft?.latestRecordTitle
                ? ` · latest saved memory: ${memoryDraft.latestRecordTitle}`
                : ""}
            </p>
          </section>
          {memoryDraft?.preview ? (
            <section className="chat-workflow-preview">
              <h4>Draft summary</h4>
              <dl className="continuity-import-stats">
                <dt>Current objective</dt>
                <dd>{memoryDraft.preview.currentObjective}</dd>
                <dt>Continuity summary</dt>
                <dd>{memoryDraft.preview.continuitySummary}</dd>
                <dt>Stable facts</dt>
                <dd>{memoryDraft.preview.stableFacts.length}</dd>
                <dt>Decisions</dt>
                <dd>{memoryDraft.preview.decisionsMade.length}</dd>
                <dt>Open issues</dt>
                <dd>{memoryDraft.preview.openIssues.length}</dd>
                <dt>Next steps</dt>
                <dd>{memoryDraft.preview.nextSteps.length}</dd>
              </dl>
            </section>
          ) : (
            <p className="muted small">
              {busyLabel === "Creating memory update..."
                ? "Creating a deterministic memory update preview..."
                : "Create a preview to inspect the markdown memory update."}
            </p>
          )}
          {memoryDraft?.markdown && (
            <label className="chat-workflow-field">
              <span>Markdown memory update</span>
              <textarea readOnly rows={14} value={memoryDraft.markdown} />
            </label>
          )}
          <div className="chat-workflow-actions">
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null}
              onClick={() => void previewMemoryCompression()}
            >
              {busyLabel === "Creating memory update..." ? "Creating..." : "Refresh Preview"}
            </button>
            <button
              type="button"
              disabled={disabled || !memoryDraft?.markdown?.trim()}
              onClick={() => void handleCopyMemoryUpdate()}
            >
              Copy Memory Update
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || !memoryDraft?.markdown?.trim() || !workspaceId}
              onClick={() => void handleApplyMemoryUpdate("update-current")}
            >
              Apply to Current Workspace
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || !memoryDraft?.markdown?.trim() || !workspaceId}
              onClick={() => void handleApplyMemoryUpdate("checkpoint-only")}
            >
              Save as Checkpoint Only
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || !memoryDraft?.markdown?.trim()}
              onClick={() => void handleApplyMemoryUpdate("create-workspace")}
            >
              Create New Workspace
            </button>
          </div>
        </div>
      )}

      {workflow.kind === "setup_local_ai" && (
        <div className="chat-workflow-stack">
          <section className="chat-workflow-preview">
            <h4>Ollama status</h4>
            <dl className="continuity-import-stats">
              <dt>Detected</dt>
              <dd>{localAiStatus?.detected ? "Yes" : "No"}</dd>
              <dt>Base URL</dt>
              <dd>{localAiStatus?.baseUrl ?? "UNKNOWN"}</dd>
              <dt>Selected model</dt>
              <dd>{localAiStatus?.selectedModel ?? "None yet"}</dd>
              <dt>Available models</dt>
              <dd>{localAiStatus?.models?.length ?? 0}</dd>
            </dl>
            <p className="muted small">
              {localAiStatus?.message ??
                "I can check whether Ollama is running and whether any local models are available."}
            </p>
          </section>
          <section className="chat-workflow-preview">
            <h4>Install / start Ollama</h4>
            <ol className="chat-workflow-list">
              <li>Install Ollama and start the local server.</li>
              <li>
                Pull a model with <span className="mono">ollama pull llama3.1</span>.
              </li>
              <li>Return here, click Detect Ollama, then select the model you want to use.</li>
            </ol>
            <p className="muted small">
              ContinuityOS now uses Ollama as the only in-app chat engine. Local memory, backups,
              and markdown portability still work while Ollama is offline.
            </p>
          </section>
          {localAiStatus?.models?.length ? (
            <label className="chat-workflow-field">
              <span>Model</span>
              <select
                value={localAiModel}
                onChange={(event) => setLocalAiModel(event.target.value)}
                disabled={disabled || busyLabel != null}
              >
                {localAiStatus.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="chat-workflow-actions">
            <button
              type="button"
              disabled={disabled || busyLabel != null}
              onClick={() => void refreshLocalAi()}
            >
              {busyLabel === "Checking local AI..." ? "Checking..." : "Detect Ollama"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null}
              onClick={() => void refreshLocalAi()}
            >
              Refresh Models
            </button>
            <button
              type="button"
              className="secondary"
              disabled={
                disabled ||
                busyLabel != null ||
                !localAiStatus?.detected ||
                !localAiModel.trim()
              }
              onClick={() => void handleUseLocalAi()}
            >
              Use Ollama for Chat
            </button>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busyLabel != null}
              onClick={() => onOpenProjectTools("local-ai")}
            >
              Open Ollama Tools
            </button>
            <button type="button" className="secondary small-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}

      {workflowError && <p className="stream-error">{workflowError}</p>}
    </article>
  );
}
