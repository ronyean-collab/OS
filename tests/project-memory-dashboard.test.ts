import { describe, expect, it } from "vitest";
import {
  buildProjectMemorySnapshot,
  buildResumeCard,
  computeMemoryHealth,
} from "../src/renderer/src/project-memory";
import type { MemoryCompressionDraft } from "../src/shared/types";

function makeDraft(overrides: Partial<MemoryCompressionDraft["preview"]> = {}): MemoryCompressionDraft {
  return {
    markdown: "# CONTINUITYOS MEMORY FILE\nfile_type: project-state\n",
    preview: {
      fileType: "project-state",
      source: "ContinuityOS",
      generatedAt: new Date().toISOString(),
      projectName: "Test Project",
      projectType: "UNKNOWN",
      currentObjective: overrides.currentObjective ?? "Build the memory dashboard",
      continuitySummary: overrides.continuitySummary ?? "Keep things local-first",
      stableFacts: overrides.stableFacts ?? ["UNKNOWN"],
      recentProgress: overrides.recentProgress ?? ["Added composer layout"],
      decisionsMade: overrides.decisionsMade ?? ["Use SQLite as canonical store"],
      openIssues: overrides.openIssues ?? ["Memory health display"],
      nextSteps: overrides.nextSteps ?? ["Add resume card"],
      importantContextForNextAi: "Test context",
      recentConversationExcerpts: "UNKNOWN",
      testBuildGitStatus: [],
      risksWarnings: [],
      rulesForFutureAi: [],
    },
    levels: ["raw_messages", "thread_summary", "project_state", "workspace_memory"],
    sourceMessageCount: 5,
    sourceTimelineEventCount: 3,
    latestRecordTitle: "project-state",
  };
}

describe("project memory dashboard helpers", () => {
  it("shows objective, decisions, open issues, and next steps when memory exists", () => {
    const snap = buildProjectMemorySnapshot(makeDraft());
    expect(snap.hasMemory).toBe(true);
    expect(snap.currentObjective).toBe("Build the memory dashboard");
    expect(snap.continuitySummary).toBe("Keep things local-first");
    expect(snap.decisionsMade).toContain("Use SQLite as canonical store");
    expect(snap.openIssues).toContain("Memory health display");
    expect(snap.nextSteps).toContain("Add resume card");
    expect(snap.recentProgress).toContain("Added composer layout");
  });

  it("returns friendly empty state when no memory exists (null draft)", () => {
    const snap = buildProjectMemorySnapshot(null);
    expect(snap.hasMemory).toBe(false);
    expect(snap.currentObjective).toBeNull();
    expect(snap.continuitySummary).toBeNull();
    expect(snap.decisionsMade).toEqual([]);
    expect(snap.openIssues).toEqual([]);
    expect(snap.nextSteps).toEqual([]);
  });

  it("hides UNKNOWN values and does not invent facts", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraft({
        currentObjective: "UNKNOWN",
        continuitySummary: "UNKNOWN",
        decisionsMade: ["UNKNOWN"],
        openIssues: ["UNKNOWN", ""],
        nextSteps: [],
      }),
    );
    expect(snap.currentObjective).toBeNull();
    expect(snap.continuitySummary).toBeNull();
    expect(snap.decisionsMade).toEqual([]);
    expect(snap.openIssues).toEqual([]);
  });

  it("still has memory when only decisions are known even if objective is UNKNOWN", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraft({ currentObjective: "UNKNOWN", continuitySummary: "UNKNOWN" }),
    );
    // decisions/issues/steps are still known
    expect(snap.hasMemory).toBe(true);
  });
});

describe("memory health indicator", () => {
  it("returns no_memory when there is no memory", () => {
    const h = computeMemoryHealth({ hasMemory: false, messagesSinceLastUpdate: 0 });
    expect(h.status).toBe("no_memory");
    expect(h.label).toMatch(/No memory/i);
  });

  it("returns healthy when memory exists and message count is low", () => {
    const h = computeMemoryHealth({ hasMemory: true, messagesSinceLastUpdate: 3 });
    expect(h.status).toBe("healthy");
    expect(h.label).toMatch(/Healthy/i);
    expect(h.suggestion).toBeNull();
  });

  it("returns update_suggested when message count exceeds threshold", () => {
    const h = computeMemoryHealth({
      hasMemory: true,
      messagesSinceLastUpdate: 15,
      updateSuggestThreshold: 12,
    });
    expect(h.status).toBe("update_suggested");
    expect(h.label).toMatch(/update suggested/i);
    expect(h.suggestion).toBeTruthy();
  });

  it("returns backup_recommended when backupNeverDone is true", () => {
    const h = computeMemoryHealth({
      hasMemory: true,
      messagesSinceLastUpdate: 3,
      backupNeverDone: true,
    });
    expect(h.status).toBe("backup_recommended");
  });

  it("returns needs_attention when there is an error", () => {
    const h = computeMemoryHealth({
      hasMemory: true,
      messagesSinceLastUpdate: 0,
      hasError: true,
    });
    expect(h.status).toBe("needs_attention");
  });
});

describe("resume card", () => {
  it("shows resume card when memory has objective, progress, and next step", () => {
    const snap = buildProjectMemorySnapshot(makeDraft());
    const card = buildResumeCard(snap);
    expect(card.show).toBe(true);
    expect(card.objective).toBe("Build the memory dashboard");
    expect(card.nextStep).toBe("Add resume card");
    expect(card.lastProgress).toBe("Added composer layout");
  });

  it("does not show resume card when there is no memory", () => {
    const snap = buildProjectMemorySnapshot(null);
    const card = buildResumeCard(snap);
    expect(card.show).toBe(false);
    expect(card.objective).toBeNull();
    expect(card.nextStep).toBeNull();
  });

  it("does not show resume card when all fields are UNKNOWN/empty", () => {
    const snap = buildProjectMemorySnapshot(
      makeDraft({
        currentObjective: "UNKNOWN",
        recentProgress: [],
        nextSteps: [],
        decisionsMade: [],
        openIssues: [],
        continuitySummary: "UNKNOWN",
      }),
    );
    const card = buildResumeCard(snap);
    expect(card.show).toBe(false);
  });
});
