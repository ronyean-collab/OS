/** Single provisioning readiness state — one label at a time across the app. */

import type { DefaultAiRouteStatus } from "./default-ai-config";
import type { EmbeddedAiInstallPhase } from "./embedded-local-ai-consumer";
import {
  AI_STATUS_NEEDS_ATTENTION,
  AI_STATUS_READY,
} from "./ai-readiness";
import {
  isConfirmedNoInternet,
  preparationReasonConsumerMessage,
} from "./preparation-reasons";

export type ProvisioningReadinessState =
  | "PREPARING"
  | "DOWNLOADING"
  | "STARTING"
  | "VERIFYING"
  | "READY"
  | "FAILED";

export type ProvisioningReadinessView = {
  state: ProvisioningReadinessState;
  canReply: boolean;
  consumerMessage: string;
};

function isInProgressPhase(p: EmbeddedAiInstallPhase): boolean {
  return (
    p === "checking" ||
    p === "installing_runtime" ||
    p === "starting_runtime" ||
    p === "downloading" ||
    p === "preparing" ||
    p === "idle"
  );
}

export function resolveProvisioningReadiness(input: {
  embeddedPhase?: EmbeddedAiInstallPhase | null;
  canReply: boolean;
  defaultAiRouteStatus?: DefaultAiRouteStatus;
  defaultAiConsumerMessage?: string | null;
  offline?: boolean;
}): ProvisioningReadinessView {
  const reasonMessage = (offline?: boolean) =>
    preparationReasonConsumerMessage({
      workspaceLoaded: true,
      embeddedPhase: input.embeddedPhase,
      canReply: false,
      offline,
      defaultAiRouteStatus: input.defaultAiRouteStatus,
    });

  if (input.canReply) {
    return {
      state: "READY",
      canReply: true,
      consumerMessage: AI_STATUS_READY,
    };
  }

  const phase = input.embeddedPhase ?? "idle";
  const routeStatus = input.defaultAiRouteStatus;

  if (phase === "failed" || phase === "offline_waiting" || phase === "paused") {
    if (routeStatus === "needs_attention" && !isInProgressPhase(phase)) {
      return {
        state: "FAILED",
        canReply: false,
        consumerMessage: AI_STATUS_NEEDS_ATTENTION,
      };
    }
    const offline = isConfirmedNoInternet({ offline: input.offline });
    return {
      state: offline ? "FAILED" : "PREPARING",
      canReply: false,
      consumerMessage: reasonMessage(input.offline),
    };
  }

  if (phase === "ready" && !input.canReply) {
    return {
      state: "VERIFYING",
      canReply: false,
      consumerMessage: reasonMessage(input.offline),
    };
  }

  if (phase === "downloading") {
    return {
      state: "DOWNLOADING",
      canReply: false,
      consumerMessage: reasonMessage(input.offline),
    };
  }

  if (phase === "preparing") {
    return {
      state: "VERIFYING",
      canReply: false,
      consumerMessage: reasonMessage(input.offline),
    };
  }

  if (phase === "installing_runtime" || phase === "starting_runtime") {
    return {
      state: phase === "starting_runtime" ? "STARTING" : "PREPARING",
      canReply: false,
      consumerMessage: reasonMessage(input.offline),
    };
  }

  if (
    phase === "checking" ||
    phase === "idle" ||
    routeStatus === "preparing" ||
    routeStatus === "starting" ||
    routeStatus === "downloading"
  ) {
    const state: ProvisioningReadinessState =
      routeStatus === "downloading"
        ? "DOWNLOADING"
        : routeStatus === "starting"
          ? "STARTING"
          : "PREPARING";
    return {
      state,
      canReply: false,
      consumerMessage: reasonMessage(input.offline),
    };
  }

  if (routeStatus === "needs_attention") {
    return {
      state: "FAILED",
      canReply: false,
      consumerMessage: AI_STATUS_NEEDS_ATTENTION,
    };
  }

  return {
    state: "PREPARING",
    canReply: false,
    consumerMessage: reasonMessage(input.offline),
  };
}
