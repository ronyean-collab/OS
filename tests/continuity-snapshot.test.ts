import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
  updateContinuitySummary,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildContinuityIntelligenceExport,
  generateContinuitySnapshot,
} from "../electron/main/services/continuity-intelligence-service";
import { assembleWorkspaceExportPackage } from "../electron/main/services/workspace-export";

describe("continuity snapshot", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("generates human-readable and AI-portable workspace snapshot", () => {
    const db = session();
    const ws = createWorkspace(db, "Snapshot WS");
    updateContinuitySummary(db, ws.id, "Ship Continuity Intelligence as the continuity layer.");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: keep conversation history as canonical truth.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Open question: when should live web search run?",
    });

    const snapshot = generateContinuitySnapshot(db, ws.id);
    expect(snapshot.currentObjective).toContain("Continuity Intelligence");
    expect(snapshot.recentDecisions.length).toBeGreaterThan(0);
    expect(snapshot.openQuestions.length).toBeGreaterThan(0);
    expect(snapshot.markdown).toContain("# Continuity Snapshot");
    expect(snapshot.markdown).toContain("Recent Decisions");
    expect(snapshot.continuityScore).toBeGreaterThan(0);
  });

  it("includes continuity intelligence in workspace export", () => {
    const db = session();
    const ws = createWorkspace(db, "Export Intel WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: export must remain rebuildable from conversation history.",
    });
    generateContinuitySnapshot(db, ws.id);
    const pkg = assembleWorkspaceExportPackage(db, ws.id);
    expect(pkg.continuityIntelligence).toBeTruthy();
    expect(pkg.continuityIntelligence?.decisions.length).toBeGreaterThan(0);
    expect(pkg.exportFormatVersion).toBe(4);
  });

  it("buildContinuityIntelligenceExport bundles decisions, questions, timeline, and health", () => {
    const db = session();
    const ws = createWorkspace(db, "Bundle WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "We prefer local-first continuity with provider independence.",
    });
    generateContinuitySnapshot(db, ws.id);
    const bundle = buildContinuityIntelligenceExport(db, ws.id);
    expect(bundle.version).toBe(1);
    expect(bundle.timeline.some((event) => event.title === "Project Created")).toBe(true);
    expect(bundle.health).toBeTruthy();
  });
});
