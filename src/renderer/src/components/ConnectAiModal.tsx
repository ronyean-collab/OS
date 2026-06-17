import {
  AI_CONTINUE_WITHOUT_ACTION,
  AI_USE_CLOUD_ACTION,
} from "@shared/ai-readiness";
import { LOCAL_AI_ADVANCED_HEADING } from "@shared/consumer-experience-copy";

type Props = {
  open: boolean;
  preparing: boolean;
  onClose: () => void;
  onContinuePreparing: () => void;
  onUseCloudAi: () => void;
  onContinueWithoutAi: () => void;
  onOpenAdvanced: () => void;
};

export function ConnectAiModal({
  open,
  preparing,
  onClose,
  onContinuePreparing,
  onUseCloudAi,
  onContinueWithoutAi,
  onOpenAdvanced,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card connect-ai-modal"
        role="dialog"
        aria-labelledby="connect-ai-title"
        data-testid="connect-ai-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="connect-ai-title">Connect AI</h2>
        <p className="muted small">
          Choose how you want ContinuityOS to answer in chat. You can keep typing either way.
        </p>
        <div className="connect-ai-options">
          <button
            type="button"
            className="small-btn"
            data-testid="connect-ai-continue-preparing"
            onClick={onContinuePreparing}
          >
            {preparing ? "Continue preparing Polaris" : "Prepare Polaris"}
          </button>
          <button
            type="button"
            className="secondary small-btn"
            data-testid="connect-ai-use-cloud"
            onClick={onUseCloudAi}
          >
            {AI_USE_CLOUD_ACTION}
          </button>
          <button
            type="button"
            className="secondary small-btn"
            data-testid="connect-ai-continue-without"
            onClick={onContinueWithoutAi}
          >
            {AI_CONTINUE_WITHOUT_ACTION}
          </button>
        </div>
        <details className="settings-advanced connect-ai-advanced">
          <summary>{LOCAL_AI_ADVANCED_HEADING}</summary>
          <p className="muted small">
            Advanced users can review local runtime details, models, and connection help.
          </p>
          <button type="button" className="secondary small-btn" onClick={onOpenAdvanced}>
            Open advanced AI settings
          </button>
        </details>
        <div className="modal-actions">
          <button type="button" className="secondary small-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


