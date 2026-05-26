import { describe, expect, it } from "vitest";
import { getChatBubblePresentation, shouldShowGuideBubble } from "../src/renderer/src/chat-surface";

describe("chat surface", () => {
  it("maps user, assistant, and guide roles to conversation bubble positions", () => {
    expect(getChatBubblePresentation({ role: "user" })).toEqual({
      rowClass: "user",
      label: "You",
    });
    expect(getChatBubblePresentation({ role: "assistant", provider: "ollama" })).toEqual({
      rowClass: "assistant",
      label: "AI",
    });
    expect(getChatBubblePresentation({ role: "system" })).toEqual({
      rowClass: "guide",
      label: "ContinuityOS Guide",
    });
  });

  it("keeps the guide hidden during normal chat unless asked or needed", () => {
    expect(
      shouldShowGuideBubble({
        threadPresent: true,
        chatWorkflowKind: "none",
        guidanceState: "welcome",
        hasConversationalGuide: false,
        hasManualFallback: false,
        hasStreamError: false,
      }),
    ).toBe(false);

    expect(
      shouldShowGuideBubble({
        threadPresent: true,
        chatWorkflowKind: "none",
        guidanceState: "context_pack_ready",
        hasConversationalGuide: true,
        hasManualFallback: false,
        hasStreamError: false,
      }),
    ).toBe(true);

    expect(
      shouldShowGuideBubble({
        threadPresent: true,
        chatWorkflowKind: "continue_any_ai",
        guidanceState: "context_pack_ready",
        hasConversationalGuide: true,
        hasManualFallback: false,
        hasStreamError: false,
      }),
    ).toBe(false);
  });
});
