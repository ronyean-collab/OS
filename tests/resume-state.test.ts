import { describe, expect, it } from "vitest";
import {
  buildProjectMemorySnapshot,
  buildResumeCard,
} from "../src/renderer/src/project-memory";
import type { MemoryCompressionDraft } from "../src/shared/types";

function makeDraftWithFields(fields: Partial<MemoryCompressionDraft["preview"]>): MemoryCompressionDraft {
  return {
    markdown: "# test",
    preview: {
      fileType: "project-state",
      source: "ContinuityOS",
      generatedAt: new Date().toISOString(),
      projectName: "P",
      projectType: "UNKNOWN",
      currentObjective: "UNKNOWN",
      continuitySummary: "UNKNOWN",
      stableFacts: [],
      recentProgress: [],
      decisionsMade: [],
      openIssues: [],
      nextSteps: [],
      importantContextForNextAi: "UNKNOWN",
      recentConversationExcerpts: "UNKNOWN",
      testBuildGitStatus: [],
      risksWarnings: [],
      rulesForFutureAi: [],
      ...fields,
    },
    levels: ["raw_messages", "thread_summary", "project_state", "workspace_memory"],
    sourceMessageCount: 0,
    sourceTimelineEventCount: 0,
    latestRecordTitle: null,
  };
}

describe("resume state", () => {
  it("produces where-you-left-off from memory with objective, progress, and step", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraftWithFields({
        currentObjective: "Build memory OS layer",
        recentProgress: ["Added composer", "Fixed Ollama routing"],
        nextSteps: ["Add resume card"],
      }),
    );
    const card = buildResumeCard(snap);
    expect(card.show).toBe(true);
    expect(card.objective).toBe("Build memory OS layer");
    expect(card.lastProgress).toBe("Fixed Ollama routing");
    expect(card.nextStep).toBe("Add resume card");
  });

  it("shows when only objective is known", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraftWithFields({ currentObjective: "Build memory OS layer" }),
    );
    const card = buildResumeCard(snap);
    expect(card.show).toBe(true);
    expect(card.lastProgress).toBeNull();
    expect(card.nextStep).toBeNull();
  });

  it("does not show noisy card when there is no data at all", () => {
    const card = buildResumeCard(buildProjectMemorySnapshot(null));
    expect(card.show).toBe(false);
  });

  it("does not show when all fields are UNKNOWN or empty", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraftWithFields({
        currentObjective: "UNKNOWN",
        recentProgress: [],
        nextSteps: [],
      }),
    );
    const card = buildResumeCard(snap);
    expect(card.show).toBe(false);
  });

  it("uses last item of recentProgress as lastProgress", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraftWithFields({
        currentObjective: "Build X",
        recentProgress: ["step A", "step B", "step C"],
      }),
    );
    const card = buildResumeCard(snap);
    expect(card.lastProgress).toBe("step C");
  });
});
