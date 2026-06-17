/** Canonical AI readiness — single source for UI and stream routing. */

export type AiReadinessStatus =
  | "ready"
  | "preparing"
  | "downloading"
  | "unavailable"
  | "manual_mode"
  | "needs_attention";

export type AiReadinessView = {
  status: AiReadinessStatus;
  canReply: boolean;
  consumerMessage: string;
  actionLabel?: string;
  advancedMessage?: string;
};

export const AI_STATUS_READY = "AI is ready";
export const AI_STATUS_PREPARING = "AI is preparing";
export const AI_STATUS_DOWNLOADING = "Downloading AI…";
export const AI_STATUS_UNAVAILABLE = "AI is unavailable";
export const AI_STATUS_NEEDS_ATTENTION = "AI needs attention";
export const AI_STATUS_MANUAL = "You can chat manually while AI connects in the background.";

export const AI_SAVED_NOT_READY_MESSAGE =
  "Your message is saved. I'm still preparing the AI, so I can't reply yet.";

export const AI_CONNECT_ACTION = "Connect AI";
export const AI_TRY_AGAIN_ACTION = "Try again";
export const AI_USE_CLOUD_ACTION = "Use cloud AI";
export const AI_CONTINUE_WITHOUT_ACTION = "Continue without AI for now";

export function buildAiReadinessView(input: {
  status: AiReadinessStatus;
  canReply: boolean;
  consumerMessage?: string;
  actionLabel?: string;
  advancedMessage?: string;
}): AiReadinessView {
  const message =
    input.consumerMessage?.trim() ||
    (input.canReply
      ? AI_STATUS_READY
      : input.status === "downloading"
        ? AI_STATUS_DOWNLOADING
        : input.status === "preparing"
          ? AI_STATUS_PREPARING
          : input.status === "needs_attention"
            ? AI_STATUS_NEEDS_ATTENTION
            : input.status === "manual_mode"
              ? AI_STATUS_MANUAL
              : AI_STATUS_UNAVAILABLE);

  return {
    status: input.status,
    canReply: input.canReply,
    consumerMessage: message,
    actionLabel: input.actionLabel,
    advancedMessage: input.advancedMessage,
  };
}
