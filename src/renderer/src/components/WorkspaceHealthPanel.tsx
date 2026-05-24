import type { AutosaveStatus, WorkspaceHealthReport } from "@shared/types";

type Props = {
  health: WorkspaceHealthReport | null;
  autosave: AutosaveStatus | null;
  loading?: boolean;
};

function formatAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 48) return `${diffHr} hr ago`;
  return new Date(iso).toLocaleDateString();
}

export function WorkspaceHealthPanel({ health, autosave, loading }: Props) {
  if (loading) {
    return (
      <section className="workspace-health" aria-label="Workspace health">
        <p className="muted">Checking workspace health…</p>
      </section>
    );
  }

  if (!health) return null;

  const snapshotAgo = formatAgo(health.lastSnapshotAt);

  return (
    <section className="workspace-health" aria-label="Workspace health">
      <h3>Workspace health</h3>
      <ul>
        {health.replayIntegrityOk ? (
          <li className="ok">✓ Replay integrity verified</li>
        ) : (
          <li className="warn">⚠ Replay integrity needs review</li>
        )}

        {health.replayHashStatus === "verified" && (
          <li className="ok">✓ Replay hash matches latest snapshot</li>
        )}
        {health.replayHashStatus === "unknown" && (
          <li className="muted">Replay hash not recorded on last snapshot</li>
        )}
        {health.replayHashStatus === "mismatch" && (
          <li className="warn">⚠ Replay hash differs from latest snapshot</li>
        )}

        {snapshotAgo ? (
          <li className="ok">✓ Snapshot protection active ({snapshotAgo})</li>
        ) : (
          <li className="muted">No snapshots yet — manual save recommended</li>
        )}

        {autosave && !autosave.cooldownActive && (
          <li className="ok">✓ Autosave ready</li>
        )}
        {autosave?.cooldownActive && (
          <li className="muted">Autosave cooling down until next eligible window</li>
        )}

        {health.exportValidationOk === true && (
          <li className="ok">✓ Export validation passed</li>
        )}
        {health.exportValidationOk === false && (
          <li className="warn">⚠ Export validation found issues</li>
        )}

        {health.interruptedResponsesRecovered > 0 && (
          <li className="warn">
            ⚠{" "}
            {health.interruptedResponsesRecovered === 1
              ? "One interrupted response was safely recovered"
              : `${health.interruptedResponsesRecovered} interrupted responses were safely recovered`}
          </li>
        )}

        {health.integrityWarnings.length > 0 && (
          <li className="warn">
            ⚠ {health.integrityWarnings.length} integrity note
            {health.integrityWarnings.length > 1 ? "s" : ""} on file
          </li>
        )}

        {health.lastRecoverySnapshotPath && (
          <li className="muted">Recovery snapshot available from last migration</li>
        )}

        {health.status === "unhealthy" && (
          <li className="warn">⚠ Workspace needs attention before trusting export</li>
        )}
      </ul>
    </section>
  );
}
