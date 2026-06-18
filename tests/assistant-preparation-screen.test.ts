import { describe, expect, it } from "vitest";
import {
  PREPARATION_HEADLINE,
  PREPARATION_STAGE_LABELS,
  deriveAssistantPreparationStatus,
  formatEstimatedRemaining,
  resolveUnifiedAssistantStatus,
  shouldShowAssistantPreparationScreen,
} from "../src/shared/assistant-preparation-service";
import type { AppState } from "../src/shared/types";

describe("assistant preparation screen logic", () => {
  it("shows consumer headline and staged progress without technical jargon", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 52,
      canReply: false,
    });

    expect(status.consumerHeadline).toContain("Downloading");
    expect(status.preparationReason).toBe("MODEL_DOWNLOADING");
    expect(status.currentState).toBeTruthy();
    expect(status.recommendedAction).toBeTruthy();
    expect(status.stageLabel).toBe(PREPARATION_STAGE_LABELS.downloading_ai);
    expect(status.progressPercent).toBeGreaterThanOrEqual(30);
    expect(status.progressPercent).toBeLessThanOrEqual(90);
    expect(status.consumerSubtext.toLowerCase()).not.toContain("ollama");
    expect(status.consumerSubtext.toLowerCase()).not.toContain("localhost");
  });

  it("marks ready at one hundred percent", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "ready",
      embeddedProgressPercent: 100,
      canReply: true,
    });

    expect(status.isReady).toBe(true);
    expect(status.progressPercent).toBe(100);
    expect(status.stage).toBe("ready");
  });

  it("formats estimated time for consumers", () => {
    expect(formatEstimatedRemaining(30)).toBe("Less than 1 minute");
    expect(formatEstimatedRemaining(120)).toBe("About 2 minutes remaining");
    expect(formatEstimatedRemaining(300)).toBe("About 5 minutes remaining");
  });

  it("blocks chat until preparation completes on first launch", () => {
    expect(
      shouldShowAssistantPreparationScreen({
        recoveryMode: false,
        assistantPreparationCompleted: false,
        canReply: false,
        manualModeAccepted: false,
      }),
    ).toBe(true);

    const unified = resolveUnifiedAssistantStatus({
      appState: { defaultAiCanReply: false, recoveryMode: false } as AppState,
      embedded: {
        label: "Preparing",
        message: "Preparing your AI…",
        detail: "Downloading AI",
        phase: "downloading",
        progressPercent: 40,
        canChat: false,
        aiRepliesReady: false,
        chatWhilePreparingMessage: "",
        offline: false,
        paused: false,
        bytesDownloaded: null,
        bytesTotal: null,
        lastProgressAt: null,
      },
      workspaceLoaded: true,
      assistantPreparationCompleted: false,
      manualModeAccepted: false,
    });

    expect(unified.showPreparationScreen).toBe(true);
    expect(unified.canEnterChat).toBe(false);
  });

  it("allows chat after preparation is marked complete and assistant can reply", () => {
    const unified = resolveUnifiedAssistantStatus({
      appState: { defaultAiCanReply: true, recoveryMode: false } as AppState,
      embedded: {
        label: "Ready",
        message: "ContinuityOS AI is ready.",
        detail: "ContinuityOS AI is ready.",
        phase: "ready",
        progressPercent: 100,
        canChat: true,
        aiRepliesReady: true,
        chatWhilePreparingMessage: "",
        offline: false,
        paused: false,
        bytesDownloaded: null,
        bytesTotal: null,
        lastProgressAt: null,
      },
      workspaceLoaded: true,
      assistantPreparationCompleted: true,
      manualModeAccepted: false,
    });

    expect(unified.showPreparationScreen).toBe(false);
    expect(unified.canEnterChat).toBe(true);
    expect(unified.canReply).toBe(true);
  });
});
