import type { AppState, AutosaveStatus } from "@shared/types";

type Props = {
  appState: AppState | null;
  autosave?: AutosaveStatus | null;
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

export function ReliabilityIndicators({ appState, autosave }: Props) {
  if (!appState) return null;

  const snapshotAgo = formatAgo(appState.lastSnapshotAt);
  const persistAgo = formatAgo(appState.lastSuccessfulPersistenceAt);
  const interrupted = appState.interruptedResponsesRecovered > 0;
  const v = appState.version;

  return (
    <section className="reliability-indicators" aria-label="Continuity status">
      <ul>
        <li className="muted version-line">
          {v.appName} v{v.appVersion} · Schema {appState.appliedMigrationVersion}
        </li>
        {appState.recoveryMode ? (
          <li className="warn">Recovery mode active</li>
        ) : appState.continuityHealthy ? (
          <li className="ok">✓ Local continuity healthy</li>
        ) : (
          <li className="warn">Local continuity needs attention</li>
        )}
        {snapshotAgo && (
          <li className="ok">✓ Snapshot saved {snapshotAgo}</li>
        )}
        {autosave?.cooldownActive && (
          <li className="muted">Autosave paused (cooldown)</li>
        )}
        {autosave && !autosave.cooldownActive && autosave.lastAutosaveAt && (
          <li className="ok">✓ Autosave protection active</li>
        )}
        {persistAgo && (
          <li className="ok">✓ Last saved {persistAgo}</li>
        )}
        {interrupted && (
          <li className="warn">
            ⚠ Previous response was safely recovered
            {appState.interruptedResponsesRecovered > 1
              ? ` (${appState.interruptedResponsesRecovered})`
              : ""}
          </li>
        )}
        {appState.reliabilityMessage && (
          <li className="muted">{appState.reliabilityMessage}</li>
        )}
      </ul>
    </section>
  );
}
