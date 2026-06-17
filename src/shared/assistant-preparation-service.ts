/** First-launch assistant preparation — single source of truth for readiness UX. */

import type { AppState } from "./types";
import type { EmbeddedAiConsumerStatus, EmbeddedAiInstallPhase } from "./embedded-local-ai-consumer";
import {
  AI_CONTINUE_WITHOUT_ACTION,
  AI_TRY_AGAIN_ACTION,
  AI_USE_CLOUD_ACTION,
} from "./ai-readiness";
import { resolveProvisioningReadiness } from "./provisioning-readiness";
import {
  resolveAiDownloadProgress,
  resolveActiveDownloadStage,
  type AiDownloadProgressSnapshot,
  formatEstimatedRemaining,
} from "./ai-download-progress-service";
import {
  getPreparationReasonDefinition,
  resolvePreparationReasonPresentation,
  type PreparationReason,
  type ResolvePreparationReasonInput,
} from "./preparation-reasons";

export type { PreparationReason } from "./preparation-reasons";

export { formatEstimatedRemaining } from "./ai-download-progress-service";

export type AssistantPreparationStage =
  | "creating_workspace"
  | "checking_local_ai"
  | "installing_ai"
  | "downloading_ai"
  | "starting_ai"
  | "verifying_assistant"
  | "ready"
  | "failed";

export type AssistantPreparationStageItem = {
  key: AssistantPreparationStage;
  label: string;
  state: "pending" | "active" | "complete";
};

export type AssistantPreparationStatus = {
  stage: AssistantPreparationStage;
  stageLabel: string;
  progressPercent: number;
  estimatedRemainingSeconds: number | null;
  isReady: boolean;
  hasFailed: boolean;
  failureReason: string | null;
  consumerHeadline: string;
  consumerSubtext: string;
  estimatedTimeLabel: string | null;
  advancedDetails: string | null;
  stageItems: AssistantPreparationStageItem[];
  downloadProgress: AiDownloadProgressSnapshot;
  isStalled: boolean;
  bytesLabel: string | null;
  whyMessage: string | null;
  preparationReason: PreparationReason;
  currentState: string;
  reasonMessage: string;
  recommendedAction: string;
};

export type UnifiedAssistantStatus = {
  canReply: boolean;
  canEnterChat: boolean;
  showPreparationScreen: boolean;
  preparation: AssistantPreparationStatus | null;
  headerMessage: string;
  bannerMessage: string | null;
  actionLabel: string | null;
};

export const PREPARATION_HEADLINE = "Preparing your assistant";
export const PREPARATION_SUBTEXT = "Getting everything ready. This normally takes less than a minute.";
export const PREPARATION_ONCE_NOTE = "This only happens once.";
export const PREPARATION_PRIVACY_NOTE = "Your conversations will stay on this device.";
export const PREPARATION_READY_HEADLINE = "Your assistant is ready.";
export const PREPARATION_FAILED_HEADLINE = "We couldn't prepare your assistant.";

export const PREPARATION_STAGE_LABELS: Record<
  Exclude<AssistantPreparationStage, "ready" | "failed">,
  string
> = {
  creating_workspace: "Creating workspace",
  checking_local_ai: "Checking local AI",
  installing_ai: "Installing AI",
  downloading_ai: "Downloading AI",
  starting_ai: "Starting AI",
  verifying_assistant: "Verifying AI",
};

const STAGE_ORDER: Exclude<AssistantPreparationStage, "ready" | "failed">[] = [
  "creating_workspace",
  "checking_local_ai",
  "installing_ai",
  "downloading_ai",
  "starting_ai",
  "verifying_assistant",
];

const STAGE_BASE_PROGRESS: Record<
  Exclude<AssistantPreparationStage, "ready" | "failed">,
  number
> = {
  creating_workspace: 10,
  checking_local_ai: 15,
  installing_ai: 28,
  downloading_ai: 58,
  starting_ai: 90,
  verifying_assistant: 97,
};

const STAGE_ETA_SECONDS: Record<
  Exclude<AssistantPreparationStage, "ready" | "failed">,
  number
> = {
  creating_workspace: 30,
  checking_local_ai: 90,
  installing_ai: 180,
  downloading_ai: 240,
  starting_ai: 45,
  verifying_assistant: 20,
};

export type DeriveAssistantPreparationInput = {
  workspaceLoaded: boolean;
  embeddedPhase: EmbeddedAiInstallPhase | null | undefined;
  embeddedProgressPercent: number | null | undefined;
  bytesDownloaded?: number | null;
  bytesTotal?: number | null;
  lastProgressUpdate?: string | number | null;
  canReply: boolean;
  defaultAiRouteStatus?: AppState["defaultAiRouteStatus"];
  defaultAiAdvancedMessage?: string | null;
  defaultAiConsumerMessage?: string | null;
  embeddedError?: string | null;
  paused?: boolean;
  offline?: boolean;
  nowMs?: number;
};

function mapDownloadStageToPreparation(
  downloadStage: AiDownloadProgressSnapshot["currentStage"],
): AssistantPreparationStage {
  switch (downloadStage) {
    case "downloading":
      return "downloading_ai";
    case "installing":
      return "installing_ai";
    case "starting":
      return "starting_ai";
    case "verifying":
      return "verifying_assistant";
    case "ready":
      return "ready";
    case "failed":
    case "stalled":
      return "failed";
    default:
      return "checking_local_ai";
  }
}

function buildStageItems(activeStage: AssistantPreparationStage): AssistantPreparationStageItem[] {
  const activeIndex = STAGE_ORDER.indexOf(
    activeStage as (typeof STAGE_ORDER)[number],
  );

  return STAGE_ORDER.map((key, index) => {
    let state: AssistantPreparationStageItem["state"] = "pending";
    if (activeStage === "ready") {
      state = "complete";
    } else if (activeStage === "failed") {
      state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending";
    } else if (index < activeIndex) {
      state = "complete";
    } else if (index === activeIndex) {
      state = "active";
    }
    return {
      key,
      label: PREPARATION_STAGE_LABELS[key],
      state,
    };
  });
}

function resolveFailureReason(
  input: DeriveAssistantPreparationInput,
  reasonInput: ResolvePreparationReasonInput,
): string | null {
  if (input.paused) {
    return "Preparation was paused. Tap Retry to continue.";
  }
  const presentation = resolvePreparationReasonPresentation(reasonInput);
  if (presentation.reason === "READY") return null;
  if (
    presentation.reason === "MODEL_DOWNLOADING" ||
    presentation.reason === "MISSING_RUNTIME" ||
    presentation.reason === "VERIFYING"
  ) {
    return null;
  }
  if (presentation.reason === "NO_INTERNET") {
    return presentation.reasonDetail;
  }
  return presentation.reasonDetail;
}

function buildReasonInput(
  input: DeriveAssistantPreparationInput,
  overrides?: Partial<ResolvePreparationReasonInput>,
): ResolvePreparationReasonInput {
  return {
    workspaceLoaded: input.workspaceLoaded,
    embeddedPhase: input.embeddedPhase,
    canReply: input.canReply,
    offline: input.offline,
    paused: input.paused,
    defaultAiRouteStatus: input.defaultAiRouteStatus,
    embeddedError: input.embeddedError,
    defaultAiAdvancedMessage: input.defaultAiAdvancedMessage,
    ...overrides,
  };
}

function buildAdvancedDetails(input: DeriveAssistantPreparationInput): string | null {
  const parts: string[] = [];
  if (input.defaultAiAdvancedMessage?.trim()) {
    parts.push(input.defaultAiAdvancedMessage.trim());
  }
  if (input.embeddedPhase) {
    parts.push(`Install phase: ${input.embeddedPhase}`);
  }
  if (input.embeddedProgressPercent != null) {
    parts.push(`Model download: ${input.embeddedProgressPercent}%`);
  }
  if (input.embeddedError?.trim()) {
    parts.push(`Diagnostic: ${input.embeddedError.trim()}`);
  }
  return parts.length ? parts.join("\n") : null;
}

function withReasonFields(
  base: Omit<
    AssistantPreparationStatus,
    | "preparationReason"
    | "currentState"
    | "reasonMessage"
    | "recommendedAction"
  >,
  reasonInput: ResolvePreparationReasonInput,
): AssistantPreparationStatus {
  const presentation = resolvePreparationReasonPresentation(reasonInput);
  return {
    ...base,
    preparationReason: presentation.reason,
    currentState: presentation.currentStateLabel,
    reasonMessage: presentation.reasonDetail,
    recommendedAction: presentation.recommendedAction,
  };
}

export function deriveAssistantPreparationStatus(
  input: DeriveAssistantPreparationInput,
): AssistantPreparationStatus {
  if (!input.workspaceLoaded) {
    const reasonInput = buildReasonInput(input, { workspaceLoaded: false });
    return withReasonFields(
      {
        stage: "creating_workspace",
        stageLabel: PREPARATION_STAGE_LABELS.creating_workspace,
        progressPercent: STAGE_BASE_PROGRESS.creating_workspace,
        estimatedRemainingSeconds: STAGE_ETA_SECONDS.creating_workspace,
        isReady: false,
        hasFailed: false,
        failureReason: null,
        consumerHeadline: PREPARATION_HEADLINE,
        consumerSubtext: `${PREPARATION_SUBTEXT} ${PREPARATION_ONCE_NOTE}`,
        estimatedTimeLabel: formatEstimatedRemaining(STAGE_ETA_SECONDS.creating_workspace),
        advancedDetails: null,
        stageItems: buildStageItems("creating_workspace"),
        downloadProgress: resolveAiDownloadProgress({
          workspaceLoaded: false,
          canReply: false,
          nowMs: input.nowMs,
        }),
        isStalled: false,
        bytesLabel: null,
        whyMessage: "We're setting up your workspace.",
      },
      reasonInput,
    );
  }

  const hasFailedPhase =
    input.embeddedPhase === "failed" ||
    input.embeddedPhase === "paused" ||
    input.defaultAiRouteStatus === "needs_attention";

  const reasonInputBase = buildReasonInput(input, {
    hasFailed: hasFailedPhase && !input.canReply,
  });

  const downloadProgress = resolveAiDownloadProgress({
    workspaceLoaded: input.workspaceLoaded,
    canReply: input.canReply,
    embeddedPhase: input.embeddedPhase,
    embeddedProgressPercent: input.embeddedProgressPercent,
    bytesDownloaded: input.bytesDownloaded,
    bytesTotal: input.bytesTotal,
    lastProgressUpdate: input.lastProgressUpdate,
    nowMs: input.nowMs,
    paused: input.paused,
    offline: input.offline,
    hasFailed: hasFailedPhase && !input.canReply,
    failureReason: null,
    diagnosticMessage: input.embeddedError,
    runtimeStatus: input.embeddedPhase ?? undefined,
    downloadSource: input.embeddedPhase === "downloading" ? "Built-in local model" : null,
  });

  const reasonInput: ResolvePreparationReasonInput = {
    ...reasonInputBase,
    isStalled: downloadProgress.isStalled,
    hasFailed:
      (hasFailedPhase && !input.canReply && input.embeddedPhase !== "offline_waiting") ||
      downloadProgress.currentStage === "failed",
  };

  const reasonPresentation = resolvePreparationReasonPresentation(reasonInput);
  const failureReason = resolveFailureReason(input, reasonInput);

  const stage = input.canReply
    ? "ready"
    : downloadProgress.isStalled
      ? "failed"
      : mapDownloadStageToPreparation(downloadProgress.currentStage);

  const isReady = input.canReply;
  const isNoInternet = reasonPresentation.reason === "NO_INTERNET";
  const hasFailed =
    !isNoInternet &&
    (stage === "failed" ||
      downloadProgress.currentStage === "failed" ||
      downloadProgress.isStalled);

  const stageLabel =
    stage === "ready"
      ? "Ready"
      : downloadProgress.isStalled
        ? "Preparation stalled"
        : isNoInternet
          ? reasonPresentation.currentStateLabel
          : downloadProgress.stageLabel;

  const consumerHeadline = isReady
    ? PREPARATION_READY_HEADLINE
    : downloadProgress.isStalled
      ? getPreparationReasonDefinition("DOWNLOAD_FAILED").consumerMessage
      : reasonPresentation.consumerMessage;

  const consumerSubtext = isReady
    ? reasonPresentation.whatHappensNext
    : `${reasonPresentation.whatHappensNext} ${PREPARATION_ONCE_NOTE}`;

  const advancedParts = [
    downloadProgress.advancedDetails,
    input.defaultAiAdvancedMessage?.trim(),
  ].filter(Boolean);

  const listStage = downloadProgress.isStalled
    ? mapDownloadStageToPreparation(resolveActiveDownloadStage(input))
    : mapDownloadStageToPreparation(
        downloadProgress.currentStage === "stalled"
          ? resolveActiveDownloadStage(input)
          : downloadProgress.currentStage,
      );

  return withReasonFields(
    {
      stage,
      stageLabel,
      progressPercent: downloadProgress.percentComplete,
      estimatedRemainingSeconds: downloadProgress.estimatedRemainingSeconds,
      isReady,
      hasFailed,
      failureReason:
        downloadProgress.isStalled
          ? getPreparationReasonDefinition("DOWNLOAD_FAILED").reasonDetail
          : hasFailed
            ? failureReason
            : null,
      consumerHeadline,
      consumerSubtext,
      estimatedTimeLabel: downloadProgress.estimatedTimeLabel,
      advancedDetails: advancedParts.length ? advancedParts.join("\n") : null,
      stageItems: buildStageItems(listStage),
      downloadProgress,
      isStalled: downloadProgress.isStalled,
      bytesLabel: downloadProgress.bytesLabel,
      whyMessage: downloadProgress.whyMessage,
    },
    reasonInput,
  );
}

export function shouldShowAssistantPreparationScreen(input: {
  recoveryMode: boolean;
  assistantPreparationCompleted: boolean;
  canReply: boolean;
  manualModeAccepted: boolean;
}): boolean {
  if (input.recoveryMode) return false;
  if (input.manualModeAccepted) return false;
  if (!input.assistantPreparationCompleted) return true;
  if (input.canReply) return false;
  return true;
}

export function isPreparationInProgress(
  embeddedPhase: EmbeddedAiInstallPhase | null | undefined,
  canReply: boolean,
): boolean {
  if (canReply) return false;
  const phase = embeddedPhase ?? "idle";
  return (
    phase === "checking" ||
    phase === "installing_runtime" ||
    phase === "starting_runtime" ||
    phase === "downloading" ||
    phase === "preparing" ||
    phase === "offline_waiting" ||
    phase === "paused" ||
    phase === "failed" ||
    phase === "idle"
  );
}

export function resolveUnifiedAssistantStatus(input: {
  appState: AppState | null;
  embedded: EmbeddedAiConsumerStatus | null;
  workspaceLoaded: boolean;
  assistantPreparationCompleted: boolean;
  manualModeAccepted: boolean;
}): UnifiedAssistantStatus {
  const canReply = Boolean(input.appState?.defaultAiCanReply);
  const embeddedPhase =
    input.embedded?.phase ??
    (input.appState?.embeddedAiPhase as EmbeddedAiInstallPhase | undefined);
  const provisioning = resolveProvisioningReadiness({
    embeddedPhase,
    canReply,
    defaultAiRouteStatus: input.appState?.defaultAiRouteStatus,
    defaultAiConsumerMessage: input.appState?.defaultAiConsumerMessage,
    offline: input.embedded?.offline,
  });
  const preparation = deriveAssistantPreparationStatus({
    workspaceLoaded: input.workspaceLoaded,
    embeddedPhase,
    embeddedProgressPercent:
      input.embedded?.progressPercent ?? input.appState?.embeddedAiProgressPercent,
    bytesDownloaded: input.embedded?.bytesDownloaded ?? input.appState?.embeddedAiBytesDownloaded,
    bytesTotal: input.embedded?.bytesTotal ?? input.appState?.embeddedAiBytesTotal,
    lastProgressUpdate:
      input.embedded?.lastProgressAt ?? input.appState?.embeddedAiLastProgressAt,
    canReply,
    defaultAiRouteStatus: input.appState?.defaultAiRouteStatus,
    defaultAiAdvancedMessage: input.appState?.defaultAiAdvancedMessage,
    defaultAiConsumerMessage: provisioning.consumerMessage,
    embeddedError: input.embedded?.lastError ?? null,
    paused: input.embedded?.paused,
    offline: input.embedded?.offline,
  });

  const showPreparationScreen = shouldShowAssistantPreparationScreen({
    recoveryMode: Boolean(input.appState?.recoveryMode),
    assistantPreparationCompleted: input.assistantPreparationCompleted,
    canReply,
    manualModeAccepted: input.manualModeAccepted,
  });

  const headerMessage = canReply
    ? provisioning.consumerMessage
    : showPreparationScreen
      ? PREPARATION_HEADLINE
      : provisioning.consumerMessage;

  const bannerMessage =
    showPreparationScreen || canReply || input.manualModeAccepted
      ? null
      : provisioning.consumerMessage;

  return {
    canReply,
    canEnterChat: !showPreparationScreen,
    showPreparationScreen,
    preparation: showPreparationScreen ? preparation : null,
    headerMessage,
    bannerMessage,
    actionLabel: canReply
      ? null
      : input.appState?.defaultAiActionLabel ??
        (preparation.hasFailed ? AI_TRY_AGAIN_ACTION : null),
  };
}

export const PREPARATION_FAILURE_ACTIONS = {
  retry: AI_TRY_AGAIN_ACTION,
  useCloud: AI_USE_CLOUD_ACTION,
  continueWithout: AI_CONTINUE_WITHOUT_ACTION,
} as const;
