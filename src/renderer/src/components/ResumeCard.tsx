import type { ResumeCard as ResumeCardData } from "../project-memory";

type Props = {
  data: ResumeCardData;
  onContinueChatting: () => void;
  onReviewMemory: () => void;
  onCreateMemoryUpdate: () => void;
  onDismiss: () => void;
};

export function ResumeCard({
  data,
  onContinueChatting,
  onReviewMemory,
  onCreateMemoryUpdate,
  onDismiss,
}: Props) {
  if (!data.show) return null;

  return (
    <div className="resume-card" role="complementary" aria-label="Resume where you left off">
      <div className="resume-card-header">
        <span className="resume-card-eyebrow">Welcome back</span>
        <button
          type="button"
          className="resume-card-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <p className="resume-card-title">Here's where you left off.</p>
      <div className="resume-card-body">
        {data.objective && (
          <div className="resume-field">
            <span className="resume-field-label">Objective</span>
            <span className="resume-field-value">{data.objective}</span>
          </div>
        )}
        {data.lastProgress && (
          <div className="resume-field">
            <span className="resume-field-label">Last progress</span>
            <span className="resume-field-value">{data.lastProgress}</span>
          </div>
        )}
        {data.nextStep && (
          <div className="resume-field">
            <span className="resume-field-label">Suggested next step</span>
            <span className="resume-field-value">{data.nextStep}</span>
          </div>
        )}
      </div>
      <div className="resume-card-actions">
        <button type="button" className="small-btn" onClick={onContinueChatting}>
          Continue Chatting
        </button>
        <button type="button" className="secondary small-btn" onClick={onReviewMemory}>
          Review Memory
        </button>
        <button type="button" className="secondary small-btn" onClick={onCreateMemoryUpdate}>
          Memory Update
        </button>
      </div>
    </div>
  );
}
