import { describe, expect, it } from "vitest";
import { deriveAssistantPreparationStatus } from "../src/shared/assistant-preparation-service";

describe("download progress presentation", () => {
  it("uses real download percent when available", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 52,
      canReply: false,
    });

    expect(status.stage).toBe("downloading_ai");
    expect(status.stageLabel).toBe("Downloading AI");
    expect(status.progressPercent).toBeGreaterThan(50);
    expect(status.estimatedTimeLabel).toBeTruthy();
  });

  it("shows stage progress when exact download percent is unavailable", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "checking",
      embeddedProgressPercent: null,
      lastProgressUpdate: new Date().toISOString(),
      canReply: false,
      nowMs: Date.now(),
    });

    expect(status.progressPercent).toBeGreaterThanOrEqual(5);
    expect(status.stageLabel).toBe("Checking local AI");
  });

  it("never fakes one hundred percent before ready", () => {
    const downloading = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 99,
      canReply: false,
    });
    expect(downloading.progressPercent).toBeLessThan(100);
    expect(downloading.isReady).toBe(false);
  });
});
