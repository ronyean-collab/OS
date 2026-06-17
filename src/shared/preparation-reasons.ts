/** Canonical AI preparation reasons — consumer copy and required actions. */

import type { DefaultAiRouteStatus } from "./default-ai-config";
import type { EmbeddedAiInstallPhase } from "./embedded-local-ai-consumer";

export type PreparationReason =
  | "NO_INTERNET"
  | "MISSING_RUNTIME"
  | "RUNTIME_START_FAILED"
  | "MODEL_MISSING"
  | "MODEL_DOWNLOADING"
  | "DOWNLOAD_FAILED"
  | "VERIFYING"
  | "READY"
  | "UNKNOWN_FAILURE";

export type PreparationReasonDefinition = {
  reason: PreparationReason;
  currentStateLabel: string;
  consumerMessage: string;
  reasonDetail: string;
  whatHappensNext: string;
  actionLabel: string | null;
  actionRequired: boolean;
};

export const PREPARATION_REASON_MATRIX: Record<
  PreparationReason,
  PreparationReasonDefinition
> = {
  NO_INTERNET: {
    reason: "NO_INTERNET",
    currentStateLabel: "No internet connection",
    consumerMessage: "Internet connection required to download AI.",
    reasonDetail: "We could not reach the internet from this device.",
    whatHappensNext:
      "Connect to Wi‑Fi or Ethernet and preparation will continue automatically.",
    actionLabel: null,
    actionRequired: false,
  },
  MISSING_RUNTIME: {
    reason: "MISSING_RUNTIME",
    currentStateLabel: "Installing local AI",
    consumerMessage: "Preparing local AI components.",
    reasonDetail: "The private on-device AI runtime is not ready yet.",
    whatHappensNext:
      "We're installing what your assistant needs to run on this device.",
    actionLabel: null,
    actionRequired: false,
  },
  RUNTIME_START_FAILED: {
    reason: "RUNTIME_START_FAILED",
    currentStateLabel: "Local AI did not start",
    consumerMessage: "Local AI could not start.",
    reasonDetail: "The on-device AI runtime failed to start.",
    whatHappensNext: "Try again, or review local Polaris setup in Settings.",
    actionLabel: "Try again",
    actionRequired: true,
  },
  MODEL_MISSING: {
    reason: "MODEL_MISSING",
    currentStateLabel: "Model not installed",
    consumerMessage: "The assistant model isn't available yet.",
    reasonDetail: "The language model needed for replies is missing on this device.",
    whatHappensNext: "Polaris can prepare the local model when you continue setup.",
    actionLabel: "Try again",
    actionRequired: true,
  },
  MODEL_DOWNLOADING: {
    reason: "MODEL_DOWNLOADING",
    currentStateLabel: "Downloading model",
    consumerMessage: "Downloading AI.",
    reasonDetail: "The assistant's language model is downloading to this device.",
    whatHappensNext:
      "This only happens once. You can explore the app while it finishes.",
    actionLabel: null,
    actionRequired: false,
  },
  DOWNLOAD_FAILED: {
    reason: "DOWNLOAD_FAILED",
    currentStateLabel: "Download failed",
    consumerMessage: "We couldn't download the AI.",
    reasonDetail: "The model download did not finish successfully.",
    whatHappensNext:
      "Check your connection and free disk space, then try again.",
    actionLabel: "Try again",
    actionRequired: true,
  },
  VERIFYING: {
    reason: "VERIFYING",
    currentStateLabel: "Verifying assistant",
    consumerMessage: "Verifying your assistant is ready.",
    reasonDetail: "We're confirming your assistant can reply on this device.",
    whatHappensNext: "This usually takes less than a minute.",
    actionLabel: null,
    actionRequired: false,
  },
  READY: {
    reason: "READY",
    currentStateLabel: "Ready",
    consumerMessage: "Your assistant is ready.",
    reasonDetail: "Setup is complete.",
    whatHappensNext: "Start chatting whenever you're ready.",
    actionLabel: "Start Chatting",
    actionRequired: false,
  },
  UNKNOWN_FAILURE: {
    reason: "UNKNOWN_FAILURE",
    currentStateLabel: "Setup interrupted",
    consumerMessage: "Something went wrong while preparing your assistant.",
    reasonDetail: "An unexpected issue stopped preparation.",
    whatHappensNext:
      "Try again, use cloud AI, or continue without AI for now.",
    actionLabel: "Try again",
    actionRequired: true,
  },
};

/** @deprecated Use PREPARATION_REASON_MATRIX.NO_INTERNET.consumerMessage when offline is confirmed. */
export const LEGACY_GENERIC_ONLINE_MESSAGE =
  "AI setup will continue when you're online.";

export type ResolvePreparationReasonInput = {
  workspaceLoaded: boolean;
  embeddedPhase?: EmbeddedAiInstallPhase | null;
  canReply: boolean;
  offline?: boolean;
  paused?: boolean;
  isStalled?: boolean;
  hasFailed?: boolean;
  defaultAiRouteStatus?: DefaultAiRouteStatus;
  embeddedError?: string | null;
  defaultAiAdvancedMessage?: string | null;
};

/** True only when runtime reported no connectivity — not merely slow or idle. */
export function isConfirmedNoInternet(input: {
  offline?: boolean;
}): boolean {
  return input.offline === true;
}

export function getPreparationReasonDefinition(
  reason: PreparationReason,
): PreparationReasonDefinition {
  return PREPARATION_REASON_MATRIX[reason];
}

export function formatRecommendedAction(
  def: PreparationReasonDefinition,
): string {
  if (def.actionRequired && def.actionLabel) {
    return `${def.whatHappensNext} (${def.actionLabel})`;
  }
  return def.whatHappensNext;
}

export function resolvePreparationReason(
  input: ResolvePreparationReasonInput,
): PreparationReason {
  if (input.canReply) return "READY";
  if (isConfirmedNoInternet(input)) return "NO_INTERNET";
  if (input.paused) return "UNKNOWN_FAILURE";

  const phase = input.embeddedPhase ?? "idle";
  const diagnostic = [
    input.embeddedError,
    input.defaultAiAdvancedMessage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (phase === "downloading" && !input.hasFailed && !input.isStalled) {
    return "MODEL_DOWNLOADING";
  }
  if (phase === "installing_runtime" || (!input.workspaceLoaded && phase === "idle")) {
    return "MISSING_RUNTIME";
  }
  if (phase === "checking" || phase === "idle") {
    return "MISSING_RUNTIME";
  }
  if (phase === "starting_runtime") {
    if (input.hasFailed || input.defaultAiRouteStatus === "needs_attention") {
      return "RUNTIME_START_FAILED";
    }
    return "VERIFYING";
  }
  if (phase === "preparing") return "VERIFYING";

  if (input.isStalled) return "DOWNLOAD_FAILED";

  if (phase === "failed" || input.hasFailed) {
    if (
      diagnostic.includes("econnrefused") ||
      diagnostic.includes("not reachable") ||
      diagnostic.includes("did not start")
    ) {
      return "RUNTIME_START_FAILED";
    }
    if (diagnostic.includes("download")) return "DOWNLOAD_FAILED";
    if (diagnostic.includes("model")) return "MODEL_MISSING";
    if (
      diagnostic.includes("start") ||
      diagnostic.includes("runtime") ||
      diagnostic.includes("ollama")
    ) {
      return "RUNTIME_START_FAILED";
    }
    if (phase === "downloading") return "DOWNLOAD_FAILED";
    return "UNKNOWN_FAILURE";
  }

  if (phase === "offline_waiting") {
    return isConfirmedNoInternet(input) ? "NO_INTERNET" : "UNKNOWN_FAILURE";
  }

  if (input.defaultAiRouteStatus === "needs_attention") {
    if (diagnostic.includes("model")) return "MODEL_MISSING";
    return "RUNTIME_START_FAILED";
  }

  return "MISSING_RUNTIME";
}

export function resolvePreparationReasonPresentation(
  input: ResolvePreparationReasonInput,
): PreparationReasonDefinition & {
  recommendedAction: string;
} {
  const reason = resolvePreparationReason(input);
  const def = getPreparationReasonDefinition(reason);
  return {
    ...def,
    recommendedAction: formatRecommendedAction(def),
  };
}

/** Consumer message for banners/composer — never the legacy generic unless NO_INTERNET. */
export function preparationReasonConsumerMessage(
  input: ResolvePreparationReasonInput,
): string {
  return resolvePreparationReasonPresentation(input).consumerMessage;
}
