import { describe, expect, it } from "vitest";
import {
  AI_DOWNLOAD_STALL_THRESHOLD_MS,
  formatByteSize,
  formatBytesProgress,
  resolveAiDownloadProgress,
} from "../src/shared/ai-download-progress-service";
import { deriveAssistantPreparationStatus } from "../src/shared/assistant-preparation-service";

const NOW = 1_700_000_000_000;

describe("ai download progress service", () => {
  it("formats byte sizes for consumer display", () => {
    expect(formatByteSize(1_200_000_000)).toBe("1.1 GB");
    expect(formatBytesProgress(1_200_000_000, 3_200_000_000)).toBe("1.1 GB / 3.0 GB");
  });

  it("uses byte ratio for download percent when totals are known", () => {
    const progress = resolveAiDownloadProgress({
      workspaceLoaded: true,
      canReply: false,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 10,
      bytesDownloaded: 1_200_000_000,
      bytesTotal: 3_200_000_000,
      lastProgressUpdate: NOW - 5_000,
      nowMs: NOW,
    });

    expect(progress.currentStage).toBe("downloading");
    expect(progress.percentComplete).toBeGreaterThan(30);
    expect(progress.bytesLabel).toContain("/");
    expect(progress.isDownloading).toBe(true);
  });

  it("never shows zero percent while actively preparing", () => {
    const progress = resolveAiDownloadProgress({
      workspaceLoaded: true,
      canReply: false,
      embeddedPhase: "checking",
      embeddedProgressPercent: null,
      lastProgressUpdate: NOW - 2_000,
      nowMs: NOW,
    });

    expect(progress.percentComplete).toBeGreaterThanOrEqual(5);
  });

  it("detects stall after 60 seconds without progress", () => {
    const progress = resolveAiDownloadProgress({
      workspaceLoaded: true,
      canReply: false,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 37,
      bytesDownloaded: 500_000_000,
      bytesTotal: 2_000_000_000,
      lastProgressUpdate: NOW - AI_DOWNLOAD_STALL_THRESHOLD_MS - 1_000,
      nowMs: NOW,
    });

    expect(progress.isStalled).toBe(true);
    expect(progress.currentStage).toBe("stalled");
    expect(progress.canonicalStatusMessage).toContain("stalled");
  });

  it("maps offline failure without contradictory preparing label", () => {
    const progress = resolveAiDownloadProgress({
      workspaceLoaded: true,
      canReply: false,
      embeddedPhase: "offline_waiting",
      offline: true,
      hasFailed: true,
      lastProgressUpdate: NOW,
      nowMs: NOW,
    });

    expect(progress.currentStage).toBe("failed");
    expect(progress.canonicalStatusMessage).toMatch(/internet|connection/i);
  });

  it("estimates time from download bytes when possible", () => {
    const progress = resolveAiDownloadProgress({
      workspaceLoaded: true,
      canReply: false,
      embeddedPhase: "downloading",
      bytesDownloaded: 800_000_000,
      bytesTotal: 3_200_000_000,
      lastProgressUpdate: NOW - 30_000,
      nowMs: NOW,
    });

    expect(progress.estimatedTimeLabel).toBeTruthy();
  });
});

describe("preparation screen integration", () => {
  it("shows download headline and byte label during model download", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 37,
      bytesDownloaded: 1_200_000_000,
      bytesTotal: 3_200_000_000,
      lastProgressUpdate: new Date(NOW).toISOString(),
      canReply: false,
      nowMs: NOW,
    });

    expect(status.stageLabel).toBe("Downloading AI");
    expect(status.progressPercent).toBeGreaterThan(0);
    expect(status.bytesLabel).toContain("/");
    expect(status.consumerHeadline).toBe("Downloading AI.");
  });

  it("flags stall state for preparation UI", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 37,
      bytesDownloaded: 500_000_000,
      bytesTotal: 2_000_000_000,
      lastProgressUpdate: new Date(NOW - AI_DOWNLOAD_STALL_THRESHOLD_MS - 5_000).toISOString(),
      canReply: false,
      nowMs: NOW,
    });

    expect(status.isStalled).toBe(true);
    expect(status.consumerHeadline).toMatch(/couldn't download|download failed|stalled/i);
  });

  it("resumes display stage list while stalled on underlying download", () => {
    const status = deriveAssistantPreparationStatus({
      workspaceLoaded: true,
      embeddedPhase: "downloading",
      embeddedProgressPercent: 40,
      bytesDownloaded: 800_000_000,
      bytesTotal: 2_000_000_000,
      lastProgressUpdate: new Date(NOW - AI_DOWNLOAD_STALL_THRESHOLD_MS - 5_000).toISOString(),
      canReply: false,
      nowMs: NOW,
    });

    const active = status.stageItems.find((item) => item.state === "active");
    expect(active?.key).toBe("downloading_ai");
  });
});

