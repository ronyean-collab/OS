import { useMemo, useState } from "react";
import type { AppState, Thread } from "@shared/types";
import type { OnboardingState } from "@shared/onboarding-state";
import {
  clearRendererFirstTimeState,
  deriveFirstTimeUserSimulationPath,
  type ExperienceResetResult,
} from "@shared/first-time-user-experience";
import {
  resolveUnifiedAssistantStatus,
  type AssistantPreparationStatus,
} from "@shared/assistant-preparation-service";
import type { EmbeddedAiConsumerStatus } from "@shared/types";

type Props = {
  workspaceId: string | null;
  workspaceIds: string[];
  onboarding: OnboardingState | null;
  appState: AppState | null;
  embeddedAiConsumerStatus: EmbeddedAiConsumerStatus | null;
  threads: Thread[];
  loading: boolean;
  onResetComplete: () => void;
};

export function FirstTimeExperienceDevPanel({
  workspaceId,
  workspaceIds,
  onboarding,
  appState,
  embeddedAiConsumerStatus,
  threads,
  loading,
  onResetComplete,
}: Props) {
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<ExperienceResetResult | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const unified = useMemo(
    () =>
      resolveUnifiedAssistantStatus({
        appState,
        embedded: embeddedAiConsumerStatus,
        workspaceLoaded: Boolean(workspaceId),
        assistantPreparationCompleted: Boolean(onboarding?.assistantPreparationCompleted),
        manualModeAccepted: Boolean(onboarding?.manualModeAccepted),
      }),
    [
      appState,
      embeddedAiConsumerStatus,
      onboarding?.assistantPreparationCompleted,
      onboarding?.manualModeAccepted,
    ],
  );

  const preparation: AssistantPreparationStatus | null =
    unified.preparation ?? null;

  const simulation = deriveFirstTimeUserSimulationPath({
    loading,
    recoveryMode: Boolean(appState?.recoveryMode),
    onboarding,
    preparation,
    showPreparationScreen: unified.showPreparationScreen,
    threadCount: threads.filter((t) => !t.deletedAt && !t.archivedAt).length,
  });

  const handleReset = async () => {
    if (!workspaceId) {
      setResetError("No active workspace to reset.");
      return;
    }
    if (
      !window.confirm(
        "Reset experience for testing? This deletes conversations, imported memory, onboarding flags, and assistant setup. Backups (snapshots) are preserved.",
      )
    ) {
      return;
    }
    setResetBusy(true);
    setResetError(null);
    setResetResult(null);
    try {
      const result = await window.continuity.resetExperience(workspaceId);
      clearRendererFirstTimeState(window.localStorage, workspaceIds);
      setResetResult(result);
      onResetComplete();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <section
      className="first-time-dev-panel"
      data-testid="first-time-experience-dev-panel"
    >
      <h3>Developer testing</h3>
      <p className="muted small">
        Simulate a brand-new install for onboarding QA. Backups in the Backups tab are not
        deleted.
      </p>

      <div className="first-time-simulation" data-testid="first-time-user-simulation">
        <h4>First-time user simulation</h4>
        <p className="muted small">{simulation.summary}</p>
        <ol className="first-time-simulation-steps">
          {simulation.steps.map((step) => (
            <li
              key={step.id}
              className={
                step.active
                  ? "active"
                  : step.complete
                    ? "complete"
                    : undefined
              }
              data-testid={`simulation-step-${step.id}`}
            >
              {step.label}
              {step.active ? " (current)" : step.complete ? " ✓" : ""}
            </li>
          ))}
        </ol>
      </div>

      <div className="backup-reminder-actions">
        <button
          type="button"
          className="secondary"
          disabled={resetBusy || !workspaceId}
          data-testid="reset-experience-button"
          onClick={() => void handleReset()}
        >
          {resetBusy ? "Resetting…" : "Reset experience"}
        </button>
      </div>

      {resetResult && (
        <p className="muted small" role="status" data-testid="reset-experience-result">
          {resetResult.message} Removed {resetResult.messagesRemoved} message(s),{" "}
          {resetResult.threadsRemoved} thread(s). {resetResult.snapshotsPreserved} backup(s)
          preserved.
        </p>
      )}
      {resetError && (
        <p className="import-warning" role="alert">
          {resetError}
        </p>
      )}
    </section>
  );
}
