import { useCallback, useEffect, useState } from "react";
import type { DiagnosticsReport, OrphanRepairPreview } from "@shared/types";

type Props = {
  workspaceId: string | null;
  onClose: () => void;
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function channelClass(tone: DiagnosticsReport["releaseBadgeTone"]): string {
  return `release-badge release-badge-${tone}`;
}

export function DiagnosticsPanel({ workspaceId, onClose }: Props) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphanPreview, setOrphanPreview] = useState<OrphanRepairPreview | null>(
    null,
  );
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await window.continuity.getDiagnostics(workspaceId ?? undefined);
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load diagnostics.");
    }
  }, [workspaceId]);

  const loadOrphanPreview = useCallback(async () => {
    try {
      const preview = await window.continuity.previewOrphanRepair(
        workspaceId ?? undefined,
      );
      setOrphanPreview(preview);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[continuity] orphan repair preview failed", err);
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
    void loadOrphanPreview();
  }, [load, loadOrphanPreview]);

  const handleCopy = async () => {
    try {
      const text = await window.continuity.copyDiagnostics(workspaceId ?? undefined);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed.");
    }
  };

  const handleExportBundle = async () => {
    try {
      const result = await window.continuity.exportDiagnostics(workspaceId ?? undefined);
      if (!result.ok || !result.json) {
        setError("Diagnostics export could not be completed.");
        return;
      }
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `continuity-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal diagnostics-modal">
        <h2>Diagnostics</h2>
        <p className="muted small">
          Local environment details for debugging. No API keys or secrets are included.
        </p>

        {error && <p className="import-warning">{error}</p>}

        {report && (
          <>
            <p className={channelClass(report.releaseBadgeTone)}>
              {report.releaseBadge} channel
            </p>
            <dl className="import-preview-stats">
              <dt>App</dt>
              <dd>
                {report.appName} v{report.appVersion}
              </dd>
              <dt>Build</dt>
              <dd>
                {report.buildNumber} ({report.releaseChannel})
              </dd>
              <dt>Build date</dt>
              <dd>{report.buildDate}</dd>
              <dt>Schema</dt>
              <dd>
                v{report.schemaVersion} (migration {report.appliedMigrationVersion})
              </dd>
              <dt>Database</dt>
              <dd className="mono">{report.databasePath}</dd>
              <dt>Recovery mode</dt>
              <dd>{report.recoveryMode ? "Active" : "Off"}</dd>
              {report.downgradeDetected && (
                <>
                  <dt>Compatibility</dt>
                  <dd className="warn-text">Downgrade detected — update app</dd>
                </>
              )}
              <dt>Last snapshot</dt>
              <dd>{formatTime(report.lastSnapshotAt)}</dd>
              <dt>Last saved</dt>
              <dd>{formatTime(report.lastSuccessfulPersistenceAt)}</dd>
            <dt>Last export</dt>
            <dd>
              {formatTime(report.lastExportAt)}
              {report.lastExportAppVersion
                ? ` · v${report.lastExportAppVersion}`
                : ""}
            </dd>
            <dt>Update readiness</dt>
            <dd>
              {report.updateReadiness.status} — {report.updateReadiness.releaseBadge}{" "}
              channel
            </dd>
            <dt>Auto-update</dt>
            <dd>{report.updateReadiness.autoUpdateEnabled ? "On" : "Off (foundation only)"}</dd>
            {report.updateReadiness.migrationSafetyWarning && (
              <>
                <dt>Migration safety</dt>
                <dd>{report.updateReadiness.migrationSafetyWarning}</dd>
              </>
            )}
            <dt>Update summary</dt>
            <dd>{report.updateReadiness.summary}</dd>
          </dl>

            {orphanPreview && orphanPreview.orphanCount > 0 && (
              <div className="orphan-repair-panel">
                <h3>Orphaned messages</h3>
                <p className="import-warning">{orphanPreview.message}</p>
                <ul className="muted small">
                  {orphanPreview.samples.map((row) => (
                    <li key={row.id}>
                      {row.role} · {row.createdAt} · thread {row.threadId.slice(0, 8)}… ·{" "}
                      {row.contentPreview || "(empty)"}
                    </li>
                  ))}
                </ul>
                {repairMessage && (
                  <p className="muted small" role="status">
                    {repairMessage}
                  </p>
                )}
                <div className="backup-reminder-actions">
                  <button
                    type="button"
                    disabled={
                      repairBusy ||
                      !orphanPreview.workspaceExists ||
                      !orphanPreview.recommendations.includes(
                        "attach_to_recovered_thread",
                      )
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Attach ${orphanPreview.orphanCount} orphaned message(s) to a new “Recovered Messages” thread?`,
                        )
                      ) {
                        return;
                      }
                      setRepairBusy(true);
                      setRepairMessage(null);
                      void window.continuity
                        .repairOrphanMessagesAttach(workspaceId ?? undefined)
                        .then((result) => {
                          setRepairMessage(result.message);
                          if (!result.ok && import.meta.env.DEV) {
                            console.error("[continuity] orphan attach failed", result);
                          }
                          return Promise.all([load(), loadOrphanPreview()]);
                        })
                        .catch((err) => {
                          const msg =
                            err instanceof Error
                              ? err.message
                              : "Orphan repair failed.";
                          setRepairMessage(msg);
                          if (import.meta.env.DEV) {
                            console.error("[continuity] orphan attach failed", err);
                          }
                        })
                        .finally(() => setRepairBusy(false));
                    }}
                  >
                    Repair orphaned messages
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={repairBusy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Quarantine ${orphanPreview.orphanCount} orphaned message(s) into local recovery metadata? They will be removed from the active messages table.`,
                        )
                      ) {
                        return;
                      }
                      setRepairBusy(true);
                      setRepairMessage(null);
                      void window.continuity
                        .repairOrphanMessagesQuarantine(workspaceId ?? undefined)
                        .then((result) => {
                          setRepairMessage(result.message);
                          if (!result.ok && import.meta.env.DEV) {
                            console.error(
                              "[continuity] orphan quarantine failed",
                              result,
                            );
                          }
                          return Promise.all([load(), loadOrphanPreview()]);
                        })
                        .catch((err) => {
                          const msg =
                            err instanceof Error
                              ? err.message
                              : "Quarantine failed.";
                          setRepairMessage(msg);
                          if (import.meta.env.DEV) {
                            console.error(
                              "[continuity] orphan quarantine failed",
                              err,
                            );
                          }
                        })
                        .finally(() => setRepairBusy(false));
                    }}
                  >
                    Quarantine orphans
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="secondary" onClick={() => void handleExportBundle()} disabled={!report}>
            {exported ? "Exported" : "Export diagnostics"}
          </button>
          <button type="button" onClick={() => void handleCopy()} disabled={!report}>
            {copied ? "Copied" : "Copy diagnostics"}
          </button>
        </div>
      </div>
    </div>
  );
}
