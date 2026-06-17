import type { MessageRole } from "@shared/types";
import type { ChatWorkflowType } from "./chat-workflows";
import type { GuidanceState } from "./guided-routines";

export type ChatBubblePresentation = {
  rowClass: "user" | "assistant" | "guide";
  label: string;
};

export function getChatBubblePresentation(input: {
  role: MessageRole;
  provider?: string | null;
}): ChatBubblePresentation {
  if (input.role === "user") {
    return { rowClass: "user", label: "You" };
  }

  if (input.role === "assistant") {
    return {
      rowClass: "assistant",
      label: input.provider?.trim() ? "AI" : "AI",
    };
  }

  return { rowClass: "guide", label: "ContinuityOS Guide" };
}

export function shouldShowGuideBubble(input: {
  threadPresent: boolean;
  chatWorkflowKind: ChatWorkflowType;
  guidanceState: GuidanceState;
  hasConversationalGuide: boolean;
  hasManualFallback: boolean;
  hasStreamError: boolean;
}): boolean {
  if (!input.threadPresent) {
    return false;
  }

  if (input.chatWorkflowKind !== "none") {
    return false;
  }

  if (input.hasConversationalGuide || input.hasManualFallback || input.hasStreamError) {
    return true;
  }

  return [
    "memory_imported",
    "context_pack_copied",
    "response_saved",
    "backup_recommended",
    "local_ai_available",
    "local_ai_unavailable",
  ].includes(input.guidanceState);
}

