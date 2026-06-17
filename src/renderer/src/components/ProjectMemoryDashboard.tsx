import type { MemoryCompressionDraft } from "@shared/types";
import {
  buildProjectMemorySnapshot,
  computeMemoryHealth,
  type MemoryHealthResult,
} from "../project-memory";

type Props = {
  draft: MemoryCompressionDraft | null;
  messagesSinceLastUpdate: number;
  backupNeverDone?: boolean;
  hasError?: boolean;
  disabled?: boolean;
  onCreateMemoryUpdate: () => void;
  onReviewMemory: () => void;
  onExportBackup: () => void;
  onOpenAdvanced: () => void;
};

function HealthPill({ health }: { health: MemoryHealthResult }) {
  const cls =
    health.status === "healthy"
      ? "memory-health-pill healthy"
      : health.status === "update_suggested"
        ? "memory-health-pill update-suggested"
        : health.status === "backup_recommended"
          ? "memory-health-pill backup-recommended"
          : health.status === "needs_attention"
            ? "memory-health-pill needs-attention"
            : "memory-health-pill no-memory";
  return <span className={cls}>{health.label}</span>;
}

function EmptyMemoryState({ onCreateMemoryUpdate }: { onCreateMemoryUpdate: () => void }) {
  return (
    <div className="project-memory-empty">
      <p className="muted">No project memory yet.</p>
      <p className="muted small">
        Chat normally and create a memory update when progress is made. Future sessions will
        pick up where you left off.
      </p>
      <button type="button" className="small-btn" onClick={onCreateMemoryUpdate}>
        Create Memory Update
      </button>
    </div>
  );
}

function MemoryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="memory-field">
      <span className="memory-field-label">{label}</span>
      <span className="memory-field-value">{value}</span>
    </div>
  );
}

function MemoryList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="memory-field">
      <span className="memory-field-label">{label}</span>
      <ul className="memory-list">
        {items.slice(0, 4).map((item, idx) => (
          <li key={idx} className="memory-list-item">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectMemoryDashboard({
  draft,
  messagesSinceLastUpdate,
  backupNeverDone = false,
  hasError = false,
  disabled = false,
  onCreateMemoryUpdate,
  onReviewMemory,
  onExportBackup,
  onOpenAdvanced,
}: Props) {
  const snapshot = buildProjectMemorySnapshot(draft);
  const health = computeMemoryHealth({
    hasMemory: snapshot.hasMemory,
    messagesSinceLastUpdate,
    backupNeverDone,
    hasError,
  });

  return (
    <section className="project-memory-dashboard" aria-label="Project Memory">
      <div className="project-memory-header">
        <div>
          <h3 className="project-memory-title">Project Memory</h3>
          <p className="muted small project-memory-subtitle">
            ContinuityOS keeps a compressed memory of this project so you can continue without
            losing context.
          </p>
        </div>
        <HealthPill health={health} />
      </div>

      {!snapshot.hasMemory ? (
        <EmptyMemoryState onCreateMemoryUpdate={onCreateMemoryUpdate} />
      ) : (
        <div className="memory-fields">
          {snapshot.currentObjective && (
            <MemoryField label="Current objective" value={snapshot.currentObjective} />
          )}
          {snapshot.continuitySummary && (
            <MemoryField label="Project summary" value={snapshot.continuitySummary} />
          )}
          <MemoryList label="Decisions" items={snapshot.decisionsMade} />
          <MemoryList label="Open issues" items={snapshot.openIssues} />
          <MemoryList label="Next steps" items={snapshot.nextSteps} />
          {snapshot.lastUpdatedAt && (
            <p className="muted small memory-last-update">
              Last updated: {snapshot.lastUpdatedAt}
            </p>
          )}
          {health.suggestion && (
            <p className="muted small memory-health-hint">{health.suggestion}</p>
          )}
        </div>
      )}

      <div className="project-memory-actions">
        <button
          type="button"
          className="small-btn"
          disabled={disabled}
          onClick={onCreateMemoryUpdate}
        >
          Memory Update
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={disabled}
          onClick={onReviewMemory}
        >
          Review Memory
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={disabled}
          onClick={onExportBackup}
        >
          Export Backup
        </button>
        <button
          type="button"
          className="secondary small-btn"
          onClick={onOpenAdvanced}
        >
          Advanced
        </button>
      </div>
    </section>
  );
}
