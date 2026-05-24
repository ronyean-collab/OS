import type { AppState, ProviderConfig, TimelineEvent } from "@shared/types";

type Props = {
  timeline: TimelineEvent[];
  providerConfig: ProviderConfig | null;
  appState: AppState | null;
};

export function ContinuityStatus({ timeline, providerConfig, appState }: Props) {
  const reliability = appState?.reliabilityMessage;
  const healthy = appState?.continuityHealthy ?? true;
  const interrupted = (appState?.interruptedResponsesRecovered ?? 0) > 0;
  const repair = appState?.sqliteRepairAttempted ?? false;
  const restored = appState?.sqliteIntegrityRestored ?? false;

  return (
    <div className="continuity-status">
      <h2>Continuity</h2>
      <p className="status-line">
        <span className={`dot ${healthy ? "ok" : "warn"}`} />
        {healthy ? "Local continuity healthy" : "Recovery mode"}
      </p>
      {reliability && (
        <p className="reliability-note" role="status">
          {restored && "✓ "}
          {interrupted && !restored && "⚠ "}
          {repair && !restored && !interrupted && "⚠ "}
          {reliability}
        </p>
      )}
      {interrupted && !reliability && (
        <p className="reliability-note" role="status">
          ⚠ Previous response was interrupted and safely preserved
        </p>
      )}
      {repair && restored && !reliability && (
        <p className="reliability-note" role="status">
          ✓ Continuity restored successfully
        </p>
      )}
      <p className="muted small">
        Provider:{" "}
        {providerConfig
          ? `${providerConfig.provider} / ${providerConfig.model}`
          : "Not configured"}
      </p>
      <h3>Recent events</h3>
      <ul className="timeline">
        {timeline.length === 0 && <li className="muted">No events yet.</li>}
        {timeline.map((e) => (
          <li key={e.id}>
            <strong>{e.title}</strong>
            <span>{e.type}</span>
            <time>{new Date(e.createdAt).toLocaleString()}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
