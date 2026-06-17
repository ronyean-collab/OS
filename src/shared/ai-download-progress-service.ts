/** Real AI download / preparation progress — single pipeline for UI. */

import type { EmbeddedAiInstallPhase } from "./embedded-local-ai-consumer";
import {
  isConfirmedNoInternet,
  preparationReasonConsumerMessage,
} from "./preparation-reasons";

export const AI_DOWNLOAD_STALL_THRESHOLD_MS = 60_000;

export type AiDownloadStage =
  | "checking"
  | "downloading"
  | "installing"
  | "starting"
  | "verifying"
  | "ready"
  | "failed"
  | "stalled";

export const AI_DOWNLOAD_STAGE_LABELS: Record<AiDownloadStage, string> = {
  checking: "Checking local AI",
  downloading: "Downloading AI",
  installing: "Installing AI",
  starting: "Starting AI",
  verifying: "Verifying AI",
  ready: "Ready",
  failed: "Failed",
  stalled: "Preparation stalled",
};

const STAGE_RANGE: Record<
  Exclude<AiDownloadStage, "ready" | "failed" | "stalled">,
  { start: number; end: number }
> = {
  checking: { start: 5, end: 15 },
  installing: { start: 15, end: 30 },
  downloading: { start: 30, end: 88 },
  starting: { start: 88, end: 94 },
  verifying: { start: 94, end: 99 },
};

export type AiDownloadProgressInput = {
  workspaceLoaded: boolean;
  canReply: boolean;
  embeddedPhase?: EmbeddedAiInstallPhase | null;
  embeddedProgressPercent?: number | null;
  bytesDownloaded?: number | null;
  bytesTotal?: number | null;
  lastProgressUpdate?: string | number | null;
  nowMs?: number;
  paused?: boolean;
  offline?: boolean;
  hasFailed?: boolean;
  failureReason?: string | null;
  downloadSource?: string | null;
  runtimeStatus?: string | null;
  diagnosticMessage?: string | null;
};

export type AiDownloadProgressSnapshot = {
  currentStage: AiDownloadStage;
  stageLabel: string;
  percentComplete: number;
  bytesDownloaded: number | null;
  bytesTotal: number | null;
  bytesLabel: string | null;
  estimatedRemainingSeconds: number | null;
  estimatedTimeLabel: string | null;
  lastProgressUpdate: number | null;
  isStalled: boolean;
  isDownloading: boolean;
  canonicalStatusMessage: string;
  whyMessage: string | null;
  advancedDetails: string | null;
};

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatBytesProgress(
  bytesDownloaded: number | null | undefined,
  bytesTotal: number | null | undefined,
): string | null {
  const done = bytesDownloaded ?? 0;
  const total = bytesTotal ?? 0;
  if (total <= 0) return null;
  return `${formatByteSize(done)} / ${formatByteSize(total)}`;
}

function parseTimestamp(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function mapEmbeddedPhaseToStage(
  input: AiDownloadProgressInput,
): Exclude<AiDownloadStage, "ready" | "failed" | "stalled"> {
  if (!input.workspaceLoaded) return "checking";

  const phase = input.embeddedPhase ?? "idle";
  if (phase === "installing_runtime") return "installing";
  if (phase === "starting_runtime") return "starting";
  if (phase === "downloading") return "downloading";
  if (phase === "preparing") return "verifying";
  if (phase === "checking" || phase === "idle") return "checking";
  return "checking";
}

function downloadSubPercent(input: AiDownloadProgressInput): number {
  const bytesDone = input.bytesDownloaded ?? 0;
  const bytesTotal = input.bytesTotal ?? 0;
  if (bytesTotal > 0) {
    return Math.min(100, Math.max(0, Math.round((bytesDone / bytesTotal) * 100)));
  }
  if (input.embeddedProgressPercent != null) {
    return Math.min(100, Math.max(0, Math.round(input.embeddedProgressPercent)));
  }
  return 0;
}

function interpolatePercent(
  stage: Exclude<AiDownloadStage, "ready" | "failed" | "stalled">,
  subPercent: number,
): number {
  const { start, end } = STAGE_RANGE[stage];
  if (stage === "downloading") {
    const span = end - start;
    return Math.min(end, start + Math.round((subPercent / 100) * span));
  }
  const midpoint = Math.round((start + end) / 2);
  return Math.max(start, midpoint);
}

function estimateDownloadSeconds(
  bytesDownloaded: number,
  bytesTotal: number,
  lastUpdateMs: number | null,
  nowMs: number,
): number | null {
  if (bytesTotal <= 0 || bytesDownloaded <= 0 || bytesDownloaded >= bytesTotal) return null;
  if (!lastUpdateMs) return null;
  const elapsedSec = Math.max(1, (nowMs - lastUpdateMs) / 1000);
  const rate = bytesDownloaded / elapsedSec;
  if (rate <= 0) return null;
  const remaining = bytesTotal - bytesDownloaded;
  return Math.max(5, Math.round(remaining / rate));
}

function estimateFromPercent(percentComplete: number): number | null {
  if (percentComplete >= 99) return 20;
  const remainingRatio = Math.max(0.05, (100 - percentComplete) / 100);
  if (remainingRatio < 0.15) return 60;
  if (remainingRatio < 0.35) return 120;
  if (remainingRatio < 0.6) return 180;
  return 300;
}

function buildWhyMessage(stage: AiDownloadStage, input: AiDownloadProgressInput): string | null {
  switch (stage) {
    case "checking":
      return "We're checking whether local AI is already on this device.";
    case "installing":
      return "We're installing the local AI runtime so your assistant can run privately on this device.";
    case "downloading":
      return "We're downloading the language model your assistant uses to reply.";
    case "starting":
      return "We're starting the local AI runtime.";
    case "verifying":
      return "We're verifying that your assistant can reply before you start chatting.";
    case "ready":
      return null;
    case "failed":
      return input.failureReason ?? "Something went wrong while preparing your assistant.";
    case "stalled":
      return "Progress has not changed recently. You can retry or view details below.";
    default:
      return null;
  }
}

function buildAdvancedDetails(
  input: AiDownloadProgressInput,
  stage: AiDownloadStage,
): string | null {
  const parts: string[] = [];
  if (input.runtimeStatus?.trim()) parts.push(`Runtime: ${input.runtimeStatus.trim()}`);
  if (input.downloadSource?.trim()) parts.push(`Download source: ${input.downloadSource.trim()}`);
  if (input.bytesTotal && input.bytesTotal > 0) {
    parts.push(
      `Download size: ${formatByteSize(input.bytesDownloaded ?? 0)} of ${formatByteSize(input.bytesTotal)}`,
    );
  } else if (input.embeddedProgressPercent != null) {
    parts.push(`Reported progress: ${input.embeddedProgressPercent}%`);
  }
  if (input.embeddedPhase) parts.push(`Install phase: ${input.embeddedPhase}`);
  if (input.diagnosticMessage?.trim()) parts.push(`Diagnostic: ${input.diagnosticMessage.trim()}`);
  if (stage === "stalled" && input.lastProgressUpdate) {
    parts.push(`Last progress update: ${new Date(input.lastProgressUpdate).toISOString()}`);
  }
  return parts.length ? parts.join("\n") : null;
}

export function formatEstimatedRemaining(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return "Less than 1 minute";
  if (seconds < 150) return "About 2 minutes remaining";
  if (seconds < 210) return "About 3 minutes remaining";
  if (seconds < 270) return "About 4 minutes remaining";
  return "About 5 minutes remaining";
}

function detectStall(
  input: AiDownloadProgressInput,
  stage: AiDownloadStage,
  percentComplete: number,
  lastUpdateMs: number | null,
  nowMs: number,
): boolean {
  if (input.hasFailed || input.paused || input.offline || input.canReply) return false;
  if (stage === "ready" || stage === "failed") return false;
  if (!lastUpdateMs) return false;

  const idleMs = nowMs - lastUpdateMs;
  if (idleMs < AI_DOWNLOAD_STALL_THRESHOLD_MS) return false;

  if (stage === "downloading" && input.bytesTotal && input.bytesTotal > 0) {
    return percentComplete < 100;
  }

  return stage === "downloading" || stage === "installing" || stage === "starting";
}

export function resolveActiveDownloadStage(
  input: AiDownloadProgressInput,
): Exclude<AiDownloadStage, "ready" | "failed" | "stalled"> {
  return mapEmbeddedPhaseToStage(input);
}

export function resolveAiDownloadProgress(
  input: AiDownloadProgressInput,
): AiDownloadProgressSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const lastUpdateMs = parseTimestamp(input.lastProgressUpdate);

  if (input.canReply) {
    return {
      currentStage: "ready",
      stageLabel: AI_DOWNLOAD_STAGE_LABELS.ready,
      percentComplete: 100,
      bytesDownloaded: input.bytesDownloaded ?? null,
      bytesTotal: input.bytesTotal ?? null,
      bytesLabel: formatBytesProgress(input.bytesDownloaded, input.bytesTotal),
      estimatedRemainingSeconds: 0,
      estimatedTimeLabel: null,
      lastProgressUpdate: lastUpdateMs,
      isStalled: false,
      isDownloading: false,
      canonicalStatusMessage: "Your assistant is ready.",
      whyMessage: null,
      advancedDetails: buildAdvancedDetails(input, "ready"),
    };
  }

  const failedPhase =
    input.hasFailed ||
    input.embeddedPhase === "failed" ||
    (input.embeddedPhase === "offline_waiting" && isConfirmedNoInternet(input));

  if (failedPhase) {
    const reasonMessage = preparationReasonConsumerMessage({
      workspaceLoaded: input.workspaceLoaded,
      embeddedPhase: input.embeddedPhase,
      canReply: false,
      offline: input.offline,
      hasFailed: true,
    });
    return {
      currentStage: "failed",
      stageLabel: AI_DOWNLOAD_STAGE_LABELS.failed,
      percentComplete: input.embeddedProgressPercent ?? STAGE_RANGE.checking.start,
      bytesDownloaded: input.bytesDownloaded ?? null,
      bytesTotal: input.bytesTotal ?? null,
      bytesLabel: formatBytesProgress(input.bytesDownloaded, input.bytesTotal),
      estimatedRemainingSeconds: null,
      estimatedTimeLabel: null,
      lastProgressUpdate: lastUpdateMs,
      isStalled: false,
      isDownloading: false,
      canonicalStatusMessage: reasonMessage,
      whyMessage: buildWhyMessage("failed", input),
      advancedDetails: buildAdvancedDetails(input, "failed"),
    };
  }

  const baseStage = mapEmbeddedPhaseToStage(input);
  const subPercent = baseStage === "downloading" ? downloadSubPercent(input) : 0;
  let percentComplete = interpolatePercent(baseStage, subPercent);
  if (percentComplete < 1 && baseStage !== "ready") {
    percentComplete = STAGE_RANGE[baseStage].start;
  }

  let estimatedRemainingSeconds: number | null = null;
  if (baseStage === "downloading" && input.bytesTotal && input.bytesTotal > 0) {
    estimatedRemainingSeconds = estimateDownloadSeconds(
      input.bytesDownloaded ?? 0,
      input.bytesTotal,
      lastUpdateMs,
      nowMs,
    );
  }
  if (estimatedRemainingSeconds == null) {
    estimatedRemainingSeconds = estimateFromPercent(percentComplete);
  }

  const isStalled = detectStall(
    input,
    baseStage,
    percentComplete,
    lastUpdateMs,
    nowMs,
  );
  const currentStage: AiDownloadStage = isStalled ? "stalled" : baseStage;
  const stageLabel = AI_DOWNLOAD_STAGE_LABELS[currentStage];
  const isDownloading = currentStage === "downloading";

  const canonicalStatusMessage = isStalled
    ? "Preparation appears stalled"
    : isDownloading
      ? AI_DOWNLOAD_STAGE_LABELS.downloading
      : AI_DOWNLOAD_STAGE_LABELS[currentStage];

  return {
    currentStage,
    stageLabel,
    percentComplete,
    bytesDownloaded: input.bytesDownloaded ?? null,
    bytesTotal: input.bytesTotal ?? null,
    bytesLabel: formatBytesProgress(input.bytesDownloaded, input.bytesTotal),
    estimatedRemainingSeconds,
    estimatedTimeLabel: formatEstimatedRemaining(estimatedRemainingSeconds),
    lastProgressUpdate: lastUpdateMs,
    isStalled,
    isDownloading,
    canonicalStatusMessage,
    whyMessage: buildWhyMessage(currentStage, input),
    advancedDetails: buildAdvancedDetails(input, currentStage),
  };
}
