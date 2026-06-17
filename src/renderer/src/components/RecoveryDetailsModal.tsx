import type { AppState, AutosaveStatus } from "@shared/types";

type Props = {
  open: boolean;
  appState: AppState | null;
  autosaveStatus: AutosaveStatus | null;
  onClose: () => void;
};

export function RecoveryDetailsModal({ open, appState, autosaveStatus, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Recovery details">
      <div className="modal recovery-details-modal">
        <h2>Recovery details</h2>
        <p className="muted small">
          ContinuityOS keeps your workspace safe on this device. These details are for reassurance
          only.
        </p>
        <dl className="recovery-details-list">
          <dt>Last autosave</dt>
          <dd className="mono">
            {autosaveStatus?.lastAutosaveAt
              ? new Date(autosaveStatus.lastAutosaveAt).toLocaleString()
              : "Not recorded yet"}
          </dd>
          <dt>Recovery confidence</dt>
          <dd>
            {appState?.recoveryConfidenceScore != null
              ? `${Math.round(appState.recoveryConfidenceScore * 100)}%`
              : "—"}
          </dd>
          <dt>Runtime health</dt>
          <dd>
            {appState?.runtimeHealthScore != null
              ? `${Math.round(appState.runtimeHealthScore * 100)}%`
              : "—"}
          </dd>
          <dt>Continuity status</dt>
          <dd>{appState?.continuityHealthy ? "Healthy" : "Needs attention"}</dd>
          {appState?.previousSessionCrashed && (
            <>
              <dt>Previous session</dt>
              <dd>Closed unexpectedly — continuity was restored on launch.</dd>
            </>
          )}
        </dl>
        <div className="modal-actions">
          <button type="button" className="small-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
