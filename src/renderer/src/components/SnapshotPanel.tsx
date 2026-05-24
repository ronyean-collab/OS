import { useState } from "react";
import type {
  RestoreExecutionResult,
  RestorePreview,
  SnapshotRecord,
} from "@shared/types";
import { RestorePreviewModal } from "./RestorePreviewModal";

type Props = {
  snapshots: SnapshotRecord[];
  workspaceId: string | null;
  disabled?: boolean;
  onCreate: (label: string) => void;
  onRestorePreview: (
    snapshotId: string,
    workspaceId: string,
  ) => Promise<RestorePreview>;
  onRestore: (
    snapshotId: string,
    workspaceId: string,
  ) => Promise<RestoreExecutionResult>;
  onRestored?: () => void;
};

function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SnapshotPanel({
  snapshots,
  workspaceId,
  disabled,
  onCreate,
  onRestorePreview,
  onRestore,
  onRestored,
}: Props) {
  const [label, setLabel] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleRestoreClick = async (id: string) => {
    if (!workspaceId) return;
    try {
      const preview = await onRestorePreview(id, workspaceId);
      setRestorePreview(preview);
      setStatusMsg(null);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Could not load restore preview.");
      setRestorePreview(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!workspaceId || !restorePreview) return;
    setRestoring(true);
    try {
      const result = await onRestore(restorePreview.snapshotId, workspaceId);
      setStatusMsg(result.message);
      if (result.ok) {
        onRestored?.();
      }
    } finally {
      setRestoring(false);
      setRestorePreview(null);
    }
  };

  return (
    <section className="ops-panel snapshot-panel">
      <div className="ops-panel-header">
        <h2>Snapshots</h2>
      </div>
      <div className="snapshot-create">
        <input
          type="text"
          placeholder="Optional label"
          value={label}
          disabled={disabled}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onCreate(label);
            setLabel("");
          }}
        >
          Save snapshot
        </button>
      </div>
      {statusMsg && (
        <p className="snapshot-restore-msg" role="status">
          {statusMsg}
        </p>
      )}
      <ul className="snapshot-list">
        {snapshots.length === 0 && (
          <li className="muted">No snapshots yet.</li>
        )}
        {snapshots.map((snap) => (
          <li key={snap.id} className="snapshot-row">
            <div className="snapshot-meta">
              <strong>{snap.label}</strong>
              {snap.isAuto && <span className="badge-auto">Auto</span>}
              {snap.restoreStatus === "completed" && (
                <span className="badge-restored">Restored</span>
              )}
              {snap.restoreStatus === "failed" && (
                <span className="badge-restore-failed">Restore failed</span>
              )}
              <time>{formatSnapshotTime(snap.createdAt)}</time>
              {snap.lastRestoredAt && (
                <span className="muted small">
                  Restored {formatSnapshotTime(snap.lastRestoredAt)}
                </span>
              )}
              {!snap.hasCheckpoint && (
                <span className="muted small">No checkpoint data</span>
              )}
            </div>
            <button
              type="button"
              className="secondary small-btn"
              disabled={disabled || !snap.hasCheckpoint || restoring}
              onClick={() => void handleRestoreClick(snap.id)}
            >
              Restore…
            </button>
          </li>
        ))}
      </ul>

      {restorePreview && (
        <RestorePreviewModal
          preview={restorePreview}
          restoring={restoring}
          onClose={() => setRestorePreview(null)}
          onConfirm={() => void handleConfirmRestore()}
        />
      )}
    </section>
  );
}
