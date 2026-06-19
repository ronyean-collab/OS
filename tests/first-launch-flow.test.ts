import { describe, expect, it } from "vitest";
import {
  deriveAssistantPreparationStatus,
  shouldShowAssistantPreparationScreen,
} from "../src/shared/assistant-preparation-service";

describe("first launch flow", () => {
  it("requires preparation screen before chat on first launch", () => {
    expect(
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: false,
        canReply: false,
        manualModeAccepted: false,
      }),
    ).toBe(true);
  });

  it("starts at creating workspace before embedded phases begin", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: false,
      embeddedPhase: "idle",
      embeddedProgressPercent: null,
      canReply: false,
    });

    expect(status.stage).toBe("creating_workspace");
    expect(status.progressPercent).toBe(10);
  });

  it("skips preparation after first successful setup", () => {
    expect(
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: true,
        canReply: true,
        manualModeAccepted: false,
      }),
    ).toBe(false);
  });

  it("allows manual chat entry when user chooses continue without AI", () => {
    expect(
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: true,
        canReply: false,
        manualModeAccepted: true,
      }),
    ).toBe(false);
  });
});
