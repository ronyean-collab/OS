/** Consumer-facing embedded local AI status — no Ollama/technical jargon. */

export type EmbeddedAiInstallPhase =
  | "idle"
  | "checking"
  | "installing_runtime"
  | "starting_runtime"
  | "downloading"
  | "preparing"
  | "ready"
  | "paused"
  | "failed"
  | "offline_waiting";

export type EmbeddedAiConsumerLabel = "Preparing" | "Ready" | "Unavailable" | "Almost ready";

export type EmbeddedAiInstallProgress = {
  phase: EmbeddedAiInstallPhase;
  progressPercent: number | null;
  consumerLabel: string;
  consumerDetail: string;
};

export type EmbeddedAiConsumerStatus = {
  label: EmbeddedAiConsumerLabel;
  message: string;
  detail: string;
  phase: EmbeddedAiInstallPhase;
  progressPercent: number | null;
  bytesDownloaded: number | null;
  bytesTotal: number | null;
  lastProgressAt: string | null;
  canChat: boolean;
  aiRepliesReady: boolean;
  chatWhilePreparingMessage: string;
  offline: boolean;
  paused: boolean;
  /** Last install/preparation error for diagnostics (not shown raw to users). */
  lastError?: string | null;
  baseUrl?: string | null;
};

export const EMBEDDED_AI_PREPARING_HEADLINE = "Preparing your AI…";

export const EMBEDDED_AI_DOWNLOADING_LABEL = "Downloading AI";

export const EMBEDDED_AI_PREPARING_LABEL = "Preparing AI";

export const EMBEDDED_AI_ALMOST_READY_LABEL = "Almost ready";

export const EMBEDDED_AI_READY_MESSAGE = "ContinuityOS AI is ready.";

export const EMBEDDED_AI_CHAT_WHILE_PREPARING =
  "Your AI is getting ready. You can explore the app while it finishes.";

import { PREPARATION_REASON_MATRIX } from "./preparation-reasons";

export const EMBEDDED_AI_OFFLINE_MESSAGE =
  PREPARATION_REASON_MATRIX.NO_INTERNET.consumerMessage;

export function mapPhaseToConsumerLabel(phase: EmbeddedAiInstallPhase): EmbeddedAiConsumerLabel {
  switch (phase) {
    case "ready":
      return "Ready";
    case "downloading":
      return "Preparing";
    case "installing_runtime":
    case "starting_runtime":
    case "preparing":
    case "checking":
      return "Almost ready";
    case "paused":
    case "offline_waiting":
      return "Preparing";
    case "failed":
      return "Unavailable";
    default:
      return "Preparing";
  }
}

export function mapPhaseToConsumerDetail(
  phase: EmbeddedAiInstallPhase,
  offline = false,
): string {
  switch (phase) {
    case "downloading":
      return EMBEDDED_AI_DOWNLOADING_LABEL;
    case "installing_runtime":
      return "Setting up local AI";
    case "starting_runtime":
      return "Starting local AI";
    case "preparing":
    case "checking":
      return EMBEDDED_AI_PREPARING_LABEL;
    case "ready":
      return EMBEDDED_AI_READY_MESSAGE;
    case "offline_waiting":
      return offline
        ? EMBEDDED_AI_OFFLINE_MESSAGE
        : PREPARATION_REASON_MATRIX.UNKNOWN_FAILURE.consumerMessage;
    case "paused":
      return "Preparation paused — tap resume in Settings when you're ready.";
    case "failed":
      return "AI preparation hit a snag. We'll try again automatically.";
    default:
      return EMBEDDED_AI_PREPARING_HEADLINE;
  }
}
