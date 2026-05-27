import { describe, expect, it } from "vitest";
import {
  computeMemoryHealth,
  shouldSuggestMemoryUpdate,
} from "../src/renderer/src/project-memory";

describe("memory health thresholds", () => {
  it("uses custom threshold", () => {
    const h = computeMemoryHealth({
      hasMemory: true,
      messagesSinceLastUpdate: 5,
      updateSuggestThreshold: 4,
    });
    expect(h.status).toBe("update_suggested");
  });

  it("backup_recommended takes precedence after healthy baseline", () => {
    const h = computeMemoryHealth({
      hasMemory: true,
      messagesSinceLastUpdate: 0,
      backupNeverDone: true,
    });
    expect(h.status).toBe("backup_recommended");
  });

  it("needs_attention takes priority over everything when hasError is true", () => {
    const h = computeMemoryHealth({
      hasMemory: true,
      messagesSinceLastUpdate: 99,
      backupNeverDone: true,
      hasError: true,
    });
    expect(h.status).toBe("needs_attention");
  });
});

describe("smart memory update suggestion", () => {
  it("triggers on signal word even at low message count", () => {
    const result = shouldSuggestMemoryUpdate({
      messagesSinceLastUpdate: 2,
      latestUserMessage: "that fixed it, working now",
      lastSuggestedAt: null,
    });
    expect(result.show).toBe(true);
    expect(result.reason).toBe("signal");
  });

  it("triggers on threshold when no signal word", () => {
    const result = shouldSuggestMemoryUpdate({
      messagesSinceLastUpdate: 12,
      latestUserMessage: "tell me more about the layout",
      lastSuggestedAt: null,
      threshold: 10,
    });
    expect(result.show).toBe(true);
    expect(result.reason).toBe("threshold");
  });

  it("does not trigger when below threshold and no signal", () => {
    const result = shouldSuggestMemoryUpdate({
      messagesSinceLastUpdate: 3,
      latestUserMessage: "tell me more about the layout",
      lastSuggestedAt: null,
      threshold: 10,
    });
    expect(result.show).toBe(false);
  });

  it("respects cooldown and does not show within cooldown window", () => {
    const now = Date.now();
    const result = shouldSuggestMemoryUpdate({
      messagesSinceLastUpdate: 20,
      latestUserMessage: "done",
      lastSuggestedAt: now - 60_000, // 1 minute ago
      cooldownMs: 5 * 60 * 1000, // 5 min cooldown
      nowMs: now,
    });
    expect(result.show).toBe(false);
  });

  it("shows again after cooldown expires", () => {
    const now = Date.now();
    const result = shouldSuggestMemoryUpdate({
      messagesSinceLastUpdate: 20,
      latestUserMessage: "done",
      lastSuggestedAt: now - 6 * 60 * 1000, // 6 min ago, cooldown is 5
      cooldownMs: 5 * 60 * 1000,
      nowMs: now,
    });
    expect(result.show).toBe(true);
  });

  it("does not trigger on null message", () => {
    const result = shouldSuggestMemoryUpdate({
      messagesSinceLastUpdate: 3,
      latestUserMessage: null,
      lastSuggestedAt: null,
    });
    expect(result.show).toBe(false);
  });
});
