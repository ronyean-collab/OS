import type { EmbeddedAiConsumerStatus, LocalAiStatus, ProviderTestResult } from "./types";
import {
  AI_STATUS_NEEDS_ATTENTION,
  AI_STATUS_PREPARING,
  AI_STATUS_READY,
} from "./ai-readiness";
import { resolveAiDownloadProgress } from "./ai-download-progress-service";

export type LocalAiCardState = {
  headline: string;
  statusPill: "Ready" | "Preparing" | "Unavailable" | "Needs attention";
  detail: string | null;
  progressPercent: number | null;
  primaryAction: "prepare" | "try_again" | "none";
  showAdvancedHint: boolean;
};

const IN_PROGRESS_PHASES = new Set([
  "checking",
  "installing_runtime",
  "starting_runtime",
  "downloading",
  "preparing",
  "offline_waiting",
  "paused",
]);

export function deriveLocalAiCardState(input: {
  canReply: boolean;
  embedded: EmbeddedAiConsumerStatus | null;
  localAiStatus: LocalAiStatus | null;
  lastTest: ProviderTestResult | null;
}): LocalAiCardState {
  const { canReply, embedded, localAiStatus, lastTest } = input;
  const phase = embedded?.phase ?? "idle";

  const progress = resolveAiDownloadProgress({
    workspaceLoaded: true,
    canReply,
    embeddedPhase: phase,
    embeddedProgressPercent: embedded?.progressPercent,
    bytesDownloaded: embedded?.bytesDownloaded,
    bytesTotal: embedded?.bytesTotal,
    lastProgressUpdate: embedded?.lastProgressAt,
    paused: embedded?.paused,
    offline: embedded?.offline,
    hasFailed: phase === "failed",
  });

  if (canReply) {
    return {
      headline: "ContinuityOS AI is ready.",
      statusPill: "Ready",
      detail: AI_STATUS_READY,
      progressPercent: 100,
      primaryAction: "none",
      showAdvancedHint: false,
    };
  }

  if (progress.isStalled) {
    return {
      headline: "Preparation appears stalled",
      statusPill: "Preparing",
      detail: progress.whyMessage,
      progressPercent: progress.percentComplete,
      primaryAction: "try_again",
      showAdvancedHint: true,
    };
  }

  if (progress.isDownloading) {
    return {
      headline: progress.stageLabel,
      statusPill: "Preparing",
      detail: progress.bytesLabel ?? progress.canonicalStatusMessage,
      progressPercent: progress.percentComplete,
      primaryAction: "none",
      showAdvancedHint: false,
    };
  }

  if (IN_PROGRESS_PHASES.has(phase)) {
    return {
      headline: progress.stageLabel,
      statusPill: "Preparing",
      detail: progress.whyMessage ?? embedded?.detail ?? AI_STATUS_PREPARING,
      progressPercent: progress.percentComplete,
      primaryAction: "none",
      showAdvancedHint: false,
    };
  }

  if (lastTest && !lastTest.ok) {
    return {
      headline: "Local AI needs attention.",
      statusPill: "Needs attention",
      detail: AI_STATUS_NEEDS_ATTENTION,
      progressPercent: null,
      primaryAction: "try_again",
      showAdvancedHint: true,
    };
  }

  if (phase === "failed") {
    return {
      headline: "Local AI needs attention.",
      statusPill: "Needs attention",
      detail: embedded?.detail ?? AI_STATUS_NEEDS_ATTENTION,
      progressPercent: null,
      primaryAction: "try_again",
      showAdvancedHint: true,
    };
  }

  if (!localAiStatus?.detected) {
    return {
      headline: progress.stageLabel,
      statusPill: "Preparing",
      detail: progress.whyMessage ?? "ContinuityOS is preparing local AI on this device.",
      progressPercent: progress.percentComplete,
      primaryAction: "none",
      showAdvancedHint: false,
    };
  }

  return {
    headline: progress.stageLabel,
    statusPill: "Preparing",
    detail: progress.canonicalStatusMessage,
    progressPercent: progress.percentComplete,
    primaryAction: "none",
    showAdvancedHint: false,
  };
}
