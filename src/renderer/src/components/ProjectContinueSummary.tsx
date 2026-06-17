import type { ResumeCard as ResumeCardData } from "../project-memory";

type Props = {
  data: ResumeCardData;
  onContinueChatting: () => void;
  onReviewMemory: () => void;
  onCreateMemoryUpdate: () => void;
};

/** Project summary in Tools — not shown on the primary chat surface. */
export function ProjectContinueSummary({
  data,
  onContinueChatting,
  onReviewMemory,
  onCreateMemoryUpdate,
}: Props) {
  if (!data.show) return null;

  return (
    <section
      className="project-continue-summary"
      aria-label="Continue project"
      data-testid="project-continue-summary"
    >
      <h3 className="project-memory-title">Continue project</h3>
      <p className="muted small project-memory-subtitle">
        Objective, progress, and next steps from your project memory.
      </p>
      <div className="memory-fields">
        {data.objective && (
          <div className="memory-field">
            <span className="memory-field-label">Objective</span>
            <span className="memory-field-value">{data.objective}</span>
          </div>
        )}
        {data.lastProgress && (
          <div className="memory-field">
            <span className="memory-field-label">Last progress</span>
            <span className="memory-field-value">{data.lastProgress}</span>
          </div>
        )}
        {data.nextStep && (
          <div className="memory-field">
            <span className="memory-field-label">Suggested next step</span>
            <span className="memory-field-value">{data.nextStep}</span>
          </div>
        )}
      </div>
      <div className="project-memory-actions">
        <button type="button" className="small-btn" onClick={onContinueChatting}>
          Continue chatting
        </button>
        <button type="button" className="secondary small-btn" onClick={onReviewMemory}>
          Review recent work
        </button>
        <button type="button" className="secondary small-btn" onClick={onCreateMemoryUpdate}>
          Memory update
        </button>
      </div>
    </section>
  );
}
