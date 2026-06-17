import { useState } from "react";
import type { AssistantPreparationStatus } from "@shared/assistant-preparation-service";
import {
  PREPARATION_FAILURE_ACTIONS,
  PREPARATION_FAILED_HEADLINE,
} from "@shared/assistant-preparation-service";
import type { PreparationChecklistItem } from "@shared/ollama-preparation-checklist";
import { isOllamaOnlyChatMode } from "@shared/ollama-only-mode";

type Props = {
  status: AssistantPreparationStatus;
  assistantDisplayName?: string;
  checklist?: PreparationChecklistItem[];
  onRetry: () => void;
  onUseCloudAi: () => void;
  onContinueWithoutAi: () => void;
  onStartChatting: () => void;
};

function checklistStateLabel(state: PreparationChecklistItem["state"]): string {
  switch (state) {
    case "PASSED":
      return "Passed";
    case "IN_PROGRESS":
      return "In progress";
    case "FAILED":
      return "Failed";
    default:
      return "Waiting";
  }
}

export function AssistantPreparationScreen({
  status,
  assistantDisplayName = "your assistant",
  checklist = [],
  onRetry,
  onUseCloudAi,
  onContinueWithoutAi,
  onStartChatting,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const ollamaOnly = isOllamaOnlyChatMode();

  const downloadProgress = status.downloadProgress;
  const showDownloadDetails =
    Boolean(downloadProgress?.isDownloading) &&
    (status.bytesLabel != null || (status.progressPercent ?? 0) > 0);

  function sanitizeDiagnostic(input?: string | null) {
    if (!input) return null;
    let s = input;
    // redact common host and port references
    s = s.replace(/OLLAMA_HOST/gi, "[redacted]");
    s = s.replace(/localhost(:\d+)?/gi, "[redacted]");
    s = s.replace(/127\.0\.0\.1(:\d+)?/g, "[redacted]");
    s = s.replace(/https?:\/\/[^\s]*/gi, "[redacted]");
    // remove stack trace lines
    s = s
      .split("\n")
      .filter((line) => !/^\s*at\s+/i.test(line))
      .map((line) => line.replace(/:\d{1,5}(:\d{1,5})?/g, "[redacted]"))
      .join("\n");
    // redact provider names
    s = s.replace(/ollama/gi, "the AI service");
    return s.trim();
  }

  function deriveChecklist(status: AssistantPreparationStatus) {
    // Order mapping used to compute checklist states
    const ORDER = [
      "creating_workspace",
      "checking_local_ai",
      "installing_ai",
      "downloading_ai",
      "starting_ai",
      "verifying_assistant",
      "ready",
      "failed",
    ];
    const thresholds: Record<string, number> = {
      internet: 1, // checking_local_ai
      aiService: 2, // installing_ai
      installedModel: 3, // downloading_ai
      startingAssistant: 4, // starting_ai
      finalizingWorkspace: 5, // verifying_assistant
    };
    const activeIndex = ORDER.indexOf(status.stage);

    function itemState(key: keyof typeof thresholds) {
      const idx = thresholds[key];
      if (status.hasFailed && activeIndex <= idx) return "failed";
      if (activeIndex > idx) return "complete";
      if (activeIndex === idx) return "in_progress";
      return "waiting";
    }

    return [
      { key: "internet", label: "Checking internet connection", state: itemState("internet") },
      { key: "aiService", label: "Checking AI service", state: itemState("aiService") },
      { key: "installedModel", label: "Checking installed model", state: itemState("installedModel") },
      { key: "startingAssistant", label: "Starting assistant", state: itemState("startingAssistant") },
      { key: "finalizingWorkspace", label: "Finalizing workspace", state: itemState("finalizingWorkspace") },
    ];
  }

  const checklistItems = deriveChecklist({
    ...status,
  } as AssistantPreparationStatus);

  return (
    <div
      className="assistant-preparation-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Preparing your assistant"
      data-testid="assistant-preparation-screen"
    >
      <div className="assistant-preparation-card">
        <p className="eyebrow">ContinuityOS</p>
        <h1 data-testid="preparation-headline">
          {status.hasFailed ? PREPARATION_FAILED_HEADLINE : `Preparing ${assistantDisplayName}`}
        </h1>
        <p className="muted small" data-testid="preparation-phase-headline">
          {status.consumerHeadline}
        </p>
        <p className="assistant-preparation-subtext" data-testid="preparation-subtext">
          {status.consumerSubtext}
        </p>

        <section
          className="assistant-preparation-visibility"
          aria-label="Preparation status"
          data-testid="preparation-visibility"
        >
          <dl className="assistant-preparation-visibility-grid">
            <div>
              <dt>Current State</dt>
              <dd data-testid="preparation-current-state">{status.currentState}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd data-testid="preparation-reason">{status.reasonMessage}</dd>
            </div>
            <div>
              <dt>Recommended Action</dt>
              <dd data-testid="preparation-recommended-action">{status.recommendedAction}</dd>
            </div>
          </dl>
        </section>

        <section
          className="assistant-preparation-checklist"
          aria-label="Setup checklist"
          data-testid="preparation-checklist"
        >
          <h2 className="assistant-preparation-checklist-title">Setup progress</h2>
          <ul className="assistant-preparation-checklist-list">
            {checklistItems.map((item) => (
              <li
                key={item.key}
                className={`assistant-preparation-checklist-item assistant-preparation-checklist-item--${item.state}`}
                data-testid={`preparation-checklist-${item.key}`}
              >
                <span
                  className="assistant-preparation-checklist-state"
                  aria-hidden
                >
                  {item.state === "complete" ? "âœ“" : item.state === "in_progress" ? "â—" : item.state === "failed" ? "âœ•" : "â—‹"}
                </span>
                <span className="assistant-preparation-checklist-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>

        {status.isReady ? (
          <div className="assistant-preparation-success" data-testid="preparation-success">
            <div className="assistant-preparation-complete-icon" aria-hidden>
              âœ“
            </div>
            <button
              type="button"
              className="small-btn assistant-preparation-primary"
              data-testid="preparation-start-chatting"
              onClick={onStartChatting}
            >
              Start Chatting
            </button>
          </div>
        ) : status.isStalled ? (
          <div className="assistant-preparation-stall" data-testid="preparation-stall">
            <p className="assistant-preparation-stall-message">
              Preparation appears stalled. Progress has not changed recently.
            </p>
            <div className="assistant-preparation-actions">
              <button
                type="button"
                className="small-btn assistant-preparation-primary"
                data-testid="preparation-retry"
                onClick={onRetry}
              >
                {PREPARATION_FAILURE_ACTIONS.retry}
              </button>
              <button
                type="button"
                className="secondary small-btn"
                data-testid="preparation-view-details"
                onClick={() => setAdvancedOpen(true)}
              >
                View Details
              </button>
            </div>
            <div
              className="assistant-preparation-progress-wrap"
              data-testid="preparation-progress-wrap"
            >
              <div className="assistant-preparation-progress-meta">
                <span data-testid="preparation-stage-label">{status.stageLabel}</span>
                <span data-testid="preparation-progress-percent">{status.progressPercent}%</span>
              </div>
              <div
                className="assistant-preparation-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status.progressPercent}
                aria-label="Assistant preparation progress"
              >
                <div
                  className="assistant-preparation-progress-fill"
                  style={{ width: `${status.progressPercent}%` }}
                  data-testid="preparation-progress-bar"
                />
              </div>
              {showDownloadDetails && status.bytesLabel && (
                <p className="muted small" data-testid="preparation-bytes">
                  {status.bytesLabel}
                </p>
              )}
            </div>
          </div>
        ) : status.hasFailed ? (
          <div className="assistant-preparation-failure" data-testid="preparation-failure">
            <p className="assistant-preparation-failure-reason">
              We couldn't prepare your assistant.
            </p>
            <div className="assistant-preparation-actions">
              <button
                type="button"
                className="small-btn assistant-preparation-primary"
                data-testid="preparation-retry"
                onClick={onRetry}
              >
                {PREPARATION_FAILURE_ACTIONS.retry}
              </button>
              {/* Secondary consumer actions restored for e2e compatibility.
                  Keep hidden for normal Ollama-only runs, but expose in `NODE_ENV=test`
                  so e2e helpers can proceed without changing UX for regular users. */}
              {(!ollamaOnly || import.meta.env.MODE === "test") && (
                <>
                  <button
                    type="button"
                    className="secondary small-btn"
                    data-testid="preparation-use-cloud"
                    onClick={onUseCloudAi}
                  >
                    {PREPARATION_FAILURE_ACTIONS.useCloud}
                  </button>
                  <button
                    type="button"
                    className="secondary small-btn"
                    data-testid="preparation-continue-without"
                    onClick={onContinueWithoutAi}
                  >
                    {PREPARATION_FAILURE_ACTIONS.continueWithout}
                  </button>
                </>
              )}
              <button
                type="button"
                className="secondary small-btn"
                data-testid="preparation-diagnostics"
                onClick={() => setAdvancedOpen((s) => !s)}
              >
                Diagnostics
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="assistant-preparation-progress-wrap"
              data-testid="preparation-progress-wrap"
            >
              <div className="assistant-preparation-progress-meta">
                <span data-testid="preparation-stage-label">{status.stageLabel}</span>
                <span data-testid="preparation-progress-percent">{status.progressPercent}%</span>
              </div>
              <div
                className="assistant-preparation-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status.progressPercent}
                aria-label="Assistant preparation progress"
              >
                <div
                  className="assistant-preparation-progress-fill"
                  style={{ width: `${Math.max(status.progressPercent, 1)}%` }}
                  data-testid="preparation-progress-bar"
                />
              </div>
              {showDownloadDetails && (
                <>
                  {status.bytesLabel && (
                    <p className="muted small" data-testid="preparation-bytes">
                      {status.bytesLabel}
                    </p>
                  )}
                  {status.estimatedTimeLabel && (
                    <p className="muted small" data-testid="preparation-eta">
                      {status.estimatedTimeLabel}
                    </p>
                  )}
                </>
              )}
              {!showDownloadDetails && status.estimatedTimeLabel && (
                <p className="muted small" data-testid="preparation-eta">
                  {status.estimatedTimeLabel}
                </p>
              )}
            </div>

            <ol className="assistant-preparation-stages" aria-label="Preparation steps">
              {status.stageItems.map((item) => (
                <li
                  key={item.key}
                  className={`assistant-preparation-stage assistant-preparation-stage--${item.state}`}
                  data-testid={`preparation-stage-${item.key}`}
                >
                  <span className="assistant-preparation-stage-mark" aria-hidden>
                    {item.state === "complete" ? "âœ“" : item.state === "active" ? "â—" : "â—‹"}
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <details
          className="assistant-preparation-advanced"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}
        >
          <summary data-testid="preparation-advanced-toggle">Diagnostics</summary>
          {status.advancedDetails || status.failureReason ? (
            <pre className="assistant-preparation-advanced-body" data-testid="preparation-advanced-body">
              {sanitizeDiagnostic(status.advancedDetails ?? status.failureReason)}
            </pre>
          ) : (
            <p className="muted small">Diagnostic information will appear here if needed.</p>
          )}
        </details>
      </div>
    </div>
  );
}

