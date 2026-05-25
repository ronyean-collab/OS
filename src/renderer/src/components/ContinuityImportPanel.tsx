import { useEffect, useMemo, useState } from "react";
import type {
  ContinuityImportApplyResult,
  ContinuityImportMode,
  MarkdownMemoryExportResult,
  MarkdownMemoryFileType,
  MarkdownMemoryPreview,
  MarkdownMemoryRecordSummary,
} from "@shared/types";
import { CONTINUITY_IMPORT_FILE_PROMPT } from "@shared/continuity-import-prompt";

type Props = {
  workspaceId: string | null;
  threadId: string | null;
  disabled: boolean;
  onImported?: (result: ContinuityImportApplyResult) => Promise<void> | void;
};

function formatImportDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatFileType(fileType: MarkdownMemoryFileType): string {
  return fileType.replace(/-/g, " ");
}

function triggerMarkdownDownload(fileName: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ContinuityImportPanel({ workspaceId, threadId, disabled, onImported }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ContinuityImportMode>("update-current");
  const [preview, setPreview] = useState<MarkdownMemoryPreview | null>(null);
  const [exported, setExported] = useState<MarkdownMemoryExportResult | null>(null);
  const [records, setRecords] = useState<MarkdownMemoryRecordSummary[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<MarkdownMemoryFileType | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatedLabel = useMemo(
    () => (preview ? formatImportDate(preview.generatedAt) : exported ? formatImportDate(exported.preview.generatedAt) : "UNKNOWN"),
    [exported, preview],
  );

  const latestRecord = records[0] ?? null;

  const refreshRecords = async () => {
    if (!workspaceId || !window.continuity?.listMarkdownMemoryRecords) {
      setRecords([]);
      return;
    }
    const nextRecords = await window.continuity.listMarkdownMemoryRecords(workspaceId);
    setRecords(nextRecords);
  };

  useEffect(() => {
    void refreshRecords();
  }, [workspaceId]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CONTINUITY_IMPORT_FILE_PROMPT);
      setStatus(
        "Markdown memory prompt copied. Paste it into ChatGPT, Claude, Gemini, Cursor, or another AI.",
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the markdown memory prompt.");
    }
  };

  const handlePreview = async () => {
    if (!window.continuity?.previewContinuityImport) return;
    setPreviewBusy(true);
    setStatus(null);
    setError(null);
    try {
      const nextPreview = await window.continuity.previewContinuityImport(text);
      setPreview(nextPreview);
      if (!nextPreview.valid) {
        setError(nextPreview.errors[0] ?? "Import file is not valid yet.");
      } else {
        setStatus("Markdown preview ready. Nothing changes until you confirm.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview the markdown memory file.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleApply = async () => {
    if (!window.continuity?.applyContinuityImport) return;
    setApplyBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await window.continuity.applyContinuityImport({
        text,
        mode,
        workspaceId: workspaceId ?? undefined,
      });
      if (!result.ok) {
        throw new Error(result.message);
      }
      await onImported?.(result);
      setStatus(result.message);
      setPreview(null);
      setText("");
      await refreshRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the markdown memory file.");
    } finally {
      setApplyBusy(false);
    }
  };

  const generateExport = async (fileType: MarkdownMemoryFileType, copyOnly = false) => {
    if (!workspaceId || !window.continuity?.exportMarkdownMemory) return;
    setExportBusy(fileType);
    setStatus(null);
    setError(null);
    try {
      const result = await window.continuity.exportMarkdownMemory({
        workspaceId,
        threadId: threadId ?? undefined,
        fileType,
      });
      setExported(result);
      await refreshRecords();
      if (copyOnly) {
        await navigator.clipboard.writeText(result.markdown);
        setStatus(`${formatFileType(fileType)} copied to the clipboard.`);
      } else {
        triggerMarkdownDownload(result.fileName, result.markdown);
        setStatus(`${result.fileName} exported.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export markdown memory.");
    } finally {
      setExportBusy(null);
    }
  };

  const copyExportedMarkdown = async () => {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported.markdown);
      setStatus(`${exported.fileName} copied to the clipboard.`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the markdown file.");
    }
  };

  return (
    <section className="continuity-import-panel" aria-label="Markdown memory files">
      <div className="continuity-import-header">
        <div>
          <h3>Markdown Memory Files</h3>
          <p className="muted small">
            Import project state from any AI chat, export a clean markdown handoff, and
            review what ContinuityOS will carry into the next Context Pack.
          </p>
        </div>
      </div>

      <section className="continuity-memory-section">
        <div className="continuity-memory-section-header">
          <div>
            <h4>Create a Markdown Memory File from your current AI chat</h4>
            <p className="muted small">
              Use any AI. Paste the prompt below into your current chat, then paste the returned
              markdown back here for preview and review.
            </p>
          </div>
          <button type="button" className="secondary small-btn" onClick={() => void copyPrompt()}>
            Copy import prompt
          </button>
        </div>
        <ol className="muted small continuity-import-steps">
          <li>Open your current AI chat.</li>
          <li>Paste the prompt below.</li>
          <li>Copy the full markdown file the AI returns.</li>
          <li>Return to ContinuityOS and paste it here.</li>
          <li>Preview it, then choose how to apply it.</li>
        </ol>
        <label className="continuity-import-field">
          <span>Paste a ContinuityOS markdown memory file</span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPreview(null);
              setStatus(null);
              setError(null);
            }}
            rows={14}
            disabled={disabled || previewBusy || applyBusy}
            placeholder="# CONTINUITYOS MEMORY FILE&#10;version: 1&#10;file_type: continuity-import&#10;source: ChatGPT&#10;..."
          />
        </label>
        <div className="continuity-import-actions">
            <button
              type="button"
            className="secondary"
            disabled={disabled || previewBusy || applyBusy || !text.trim()}
            onClick={() => void handlePreview()}
            >
            {previewBusy ? "Working…" : "Preview Markdown"}
          </button>
        </div>
      </section>

      <section className="continuity-memory-section">
        <div className="continuity-memory-section-header">
          <div>
            <h4>Export visible project memory</h4>
            <p className="muted small">
              Generate markdown-first handoff files from ContinuityOS without requiring a provider.
            </p>
          </div>
        </div>
        <div className="continuity-export-actions">
          <button
            type="button"
            className="secondary"
            disabled={disabled || !workspaceId || exportBusy !== null}
            onClick={() => void generateExport("project-state")}
          >
            {exportBusy === "project-state" ? "Exporting…" : "Export Project State (.md)"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !workspaceId || exportBusy !== null}
            onClick={() => void generateExport("ai-handoff")}
          >
            {exportBusy === "ai-handoff" ? "Exporting…" : "Export AI Handoff (.md)"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !workspaceId || !threadId || exportBusy !== null}
            onClick={() => void generateExport("thread-summary")}
          >
            {exportBusy === "thread-summary" ? "Exporting…" : "Export Thread Summary (.md)"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled || !workspaceId || exportBusy !== null}
            onClick={() => void generateExport("ai-handoff", true)}
          >
            Copy AI Handoff Prompt
          </button>
        </div>
        {exported && (
          <div className="continuity-import-preview">
            <h4>Export preview</h4>
            <dl className="continuity-import-stats">
              <dt>File name</dt>
              <dd>{exported.fileName}</dd>
              <dt>File type</dt>
              <dd>{formatFileType(exported.fileType)}</dd>
              <dt>Project name</dt>
              <dd>{exported.preview.projectName}</dd>
              <dt>Current objective</dt>
              <dd>{exported.preview.currentObjective}</dd>
              <dt>Continuity summary</dt>
              <dd>{exported.preview.continuitySummary}</dd>
              <dt>Generated</dt>
              <dd>{generatedLabel}</dd>
            </dl>
            <label className="continuity-import-field">
              <span>Generated markdown</span>
              <textarea value={exported.markdown} readOnly rows={14} />
            </label>
            <div className="continuity-import-actions">
              <button type="button" className="secondary" onClick={() => void copyExportedMarkdown()}>
                Copy Markdown
              </button>
              <button
                type="button"
                onClick={() => triggerMarkdownDownload(exported.fileName, exported.markdown)}
              >
                Download .md
              </button>
            </div>
          </div>
        )}
      </section>

      {preview && (
        <div className="continuity-import-preview">
          <h4>Import preview</h4>
          <dl className="continuity-import-stats">
            <dt>File type</dt>
            <dd>{formatFileType(preview.fileType)}</dd>
            <dt>Source</dt>
            <dd>{preview.source}</dd>
            <dt>Project name</dt>
            <dd>{preview.projectName}</dd>
            <dt>Project type</dt>
            <dd>{preview.projectType}</dd>
            <dt>Current objective</dt>
            <dd>{preview.currentObjective}</dd>
            <dt>Continuity summary</dt>
            <dd>{preview.continuitySummary}</dd>
            <dt>Stable facts</dt>
            <dd>{preview.stableFacts.length}</dd>
            <dt>Decisions made</dt>
            <dd>{preview.decisionsMade.length}</dd>
            <dt>Open issues</dt>
            <dd>{preview.openIssues.length}</dd>
            <dt>Next steps</dt>
            <dd>{preview.nextSteps.length}</dd>
            <dt>Risks</dt>
            <dd>{preview.risksWarnings.length}</dd>
            <dt>Generated</dt>
            <dd>{generatedLabel}</dd>
          </dl>

          <fieldset className="continuity-import-modes">
            <legend>Apply mode</legend>
            <label>
              <input
                type="radio"
                name="continuity-import-mode"
                value="update-current"
                checked={mode === "update-current"}
                onChange={() => setMode("update-current")}
                disabled={disabled || !workspaceId}
              />
              <span>Update current workspace</span>
            </label>
            <label>
              <input
                type="radio"
                name="continuity-import-mode"
                value="create-workspace"
                checked={mode === "create-workspace"}
                onChange={() => setMode("create-workspace")}
                disabled={disabled}
              />
              <span>Create new workspace</span>
            </label>
            <label>
              <input
                type="radio"
                name="continuity-import-mode"
                value="checkpoint-only"
                checked={mode === "checkpoint-only"}
                onChange={() => setMode("checkpoint-only")}
                disabled={disabled || !workspaceId}
              />
              <span>Add as checkpoint only</span>
            </label>
          </fieldset>

          <div className="continuity-import-actions">
            <button
              type="button"
              disabled={
                disabled ||
                applyBusy ||
                !preview.valid ||
                ((mode === "update-current" || mode === "checkpoint-only") && !workspaceId)
              }
              onClick={() => void handleApply()}
            >
              {applyBusy ? "Applying…" : "Apply Import"}
            </button>
          </div>
        </div>
      )}

      <section className="continuity-memory-section">
        <div className="continuity-memory-section-header">
          <div>
            <h4>Memory / Project State</h4>
            <p className="muted small">
              Review what was imported or generated and what future Context Packs will include.
            </p>
          </div>
        </div>
        {latestRecord ? (
          <div className="continuity-memory-review">
            <div className="continuity-memory-review-card">
              <p className="continuity-memory-kicker">
                Latest saved memory • {formatImportDate(latestRecord.createdAt)}
              </p>
              <h5>{latestRecord.title}</h5>
              <p className="muted small">
                {formatFileType(latestRecord.fileType)} from {latestRecord.source}
              </p>
              <p>{latestRecord.currentObjective}</p>
              <p className="muted small">{latestRecord.continuitySummary}</p>
              <ul className="continuity-memory-list">
                {latestRecord.decisionsMade.slice(0, 3).map((item) => (
                  <li key={`decision-${item}`}>Decision: {item}</li>
                ))}
                {latestRecord.openIssues.slice(0, 3).map((item) => (
                  <li key={`issue-${item}`}>Open issue: {item}</li>
                ))}
                {latestRecord.nextSteps.slice(0, 3).map((item) => (
                  <li key={`next-${item}`}>Next step: {item}</li>
                ))}
              </ul>
              <p className="muted small">
                Future Context Packs will include this project state, plus the latest continuity
                summary and recent conversation context.
              </p>
            </div>
            {records.length > 1 && (
              <div className="continuity-memory-records">
                <p className="muted small">Recent memory records</p>
                <ul className="continuity-memory-record-list">
                  {records.slice(1, 5).map((record) => (
                    <li key={record.id}>
                      <strong>{record.title}</strong>
                      <span className="muted small">
                        {formatFileType(record.fileType)} • {formatImportDate(record.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="muted small">
            No markdown memory records yet. Import a markdown file or export project state to start
            building visible memory.
          </p>
        )}
      </section>

      {status && <p className="muted small">{status}</p>}
      {error && <p className="stream-error">{error}</p>}
    </section>
  );
}
