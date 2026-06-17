import type { EmbeddedAiInstallPhase } from "./embedded-local-ai-consumer";
import type { AssistantPreparationStatus } from "./assistant-preparation-service";

export type PreparationChecklistState = "PASSED" | "IN_PROGRESS" | "FAILED" | "WAITING";

export type PreparationChecklistItem = {
  key: string;
  label: string;
  state: PreparationChecklistState;
  detail: string | null;
};

export function buildOllamaPreparationChecklist(input: {
  workspaceLoaded: boolean;
  preparation: AssistantPreparationStatus;
  embeddedPhase: EmbeddedAiInstallPhase | null;
  executableFound?: boolean;
  baseUrl?: string | null;
}): PreparationChecklistItem[] {
  const phase = input.embeddedPhase ?? "idle";
  const prep = input.preparation;

  const workspace: PreparationChecklistItem = {
    key: "workspace",
    label: "Workspace ready",
    state: input.workspaceLoaded ? "PASSED" : "IN_PROGRESS",
    detail: input.workspaceLoaded ? null : "Creating workspace",
  };

  const installed: PreparationChecklistItem = {
    key: "ollama_installed",
    label: "Ollama installed",
    state:
      input.executableFound === false
        ? "IN_PROGRESS"
        : phase === "installing_runtime" || phase === "checking"
          ? "IN_PROGRESS"
          : phase === "failed" && !input.executableFound
            ? "FAILED"
            : input.executableFound || phase !== "idle"
              ? "PASSED"
              : "WAITING",
    detail:
      input.executableFound === false
        ? "Local AI is not installed yet. ContinuityOS is preparing it now."
        : null,
  };

  const running: PreparationChecklistItem = {
    key: "ollama_running",
    label: "Ollama running",
    state:
      prep.isReady || phase === "ready"
        ? "PASSED"
        : phase === "starting_runtime" || phase === "installing_runtime"
          ? "IN_PROGRESS"
          : phase === "downloading" || phase === "preparing"
            ? "PASSED"
            : phase === "failed" || phase === "offline_waiting"
              ? "FAILED"
              : phase === "checking"
                ? "IN_PROGRESS"
                : "WAITING",
    detail:
      phase === "starting_runtime"
        ? "Starting local AI…"
        : input.baseUrl
          ? `Using ${input.baseUrl}`
          : null,
  };

  const modelInstalled: PreparationChecklistItem = {
    key: "model_installed",
    label: "Model installed",
    state:
      prep.isReady
        ? "PASSED"
        : phase === "downloading"
          ? "IN_PROGRESS"
          : phase === "failed" && prep.preparationReason === "DOWNLOAD_FAILED"
            ? "FAILED"
            : phase === "preparing" || phase === "ready"
              ? "PASSED"
              : "WAITING",
    detail: prep.bytesLabel,
  };

  const modelVerified: PreparationChecklistItem = {
    key: "model_verified",
    label: "Model verified",
    state:
      prep.isReady
        ? "PASSED"
        : phase === "preparing"
          ? "IN_PROGRESS"
          : prep.hasFailed && prep.preparationReason === "RUNTIME_START_FAILED"
            ? "FAILED"
            : "WAITING",
    detail: prep.estimatedTimeLabel,
  };

  const assistantReady: PreparationChecklistItem = {
    key: "assistant_ready",
    label: "Assistant ready",
    state: prep.isReady ? "PASSED" : prep.hasFailed ? "FAILED" : "IN_PROGRESS",
    detail: prep.isReady ? "You can start chatting" : prep.recommendedAction,
  };

  return [workspace, installed, running, modelInstalled, modelVerified, assistantReady];
}
