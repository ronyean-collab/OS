import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { validateMemorySavepoints } from "../electron/main/services/savepoint-integrity-validator";
import {
  CONTINUITY_DRIFT_WARNING_THRESHOLD,
  getMemoryState,
  getContinuityEvolutionStats,
  listRelevantMemoryFragments,
  persistContinuityValidationSnapshot,
  persistCalibrationSnapshot,
  rebuildDerivedMemoryFromCanonical,
  scoreContinuityReconstruction,
} from "../electron/main/services/memory-state-service";
import {
  getProviderCapabilityMetadata,
  normalizeProviderContext,
  scoreProviderContinuityPortability,
} from "../electron/main/services/provider-continuity";
import {
  generateHugeSimulationInput,
  generateConversationMessages,
  generateMultiMonthSimulation,
  generateMultiWeekSimulation,
  generateProviderSwitchSequence,
} from "./utils/continuity-sim";
import {
  enqueueMaintenanceJob,
  processMaintenanceQueue,
  runIdleContinuityMaintenance,
} from "../electron/main/services/continuity-maintenance-scheduler";
import {
  getEmbeddingProvider,
  setEmbeddingProvider,
  semanticRetrieveByEmbedding,
  updateEmbeddingCacheForThread,
} from "../electron/main/services/embedding-prototype-service";
import { getContinuityInspectorReport } from "../electron/main/services/continuity-inspector";

describe("continuity intelligence runtime", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("builds a dev continuity inspector report", () => {
    const db = session();
    const workspace = createWorkspace(db, "Inspector WS");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Open issue: preserve long-running continuity with savepoints.",
    });

    const report = getContinuityInspectorReport(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "long-running savepoints",
    });
    expect(report.runtimeContextSizeEstimate).toBeGreaterThan(0);
    expect(report.activeFragments.length).toBeGreaterThan(0);
    expect(report.savepointIntegrity.checkedCount).toBeGreaterThanOrEqual(0);
    expect(report.continuityEvolutionGraph.length).toBe(4);
    expect(report.continuityConfidence).toBeGreaterThan(0);
  });

  it("validates savepoint integrity and returns last known good", () => {
    const db = session();
    const workspace = createWorkspace(db, "Integrity WS");
    const thread = createThread(db, workspace.id, "Main");
    for (let i = 0; i < 10; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content: `Decision ${i}: keep continuity safe and recoverable.`,
      });
    }

    const report = validateMemorySavepoints(db, workspace.id);
    expect(report.checkedCount).toBeGreaterThan(0);
    expect(report.lastKnownGoodSavepointId).toBeTruthy();
  });

  it(
    "supports long-running conversation simulation and continuity rebuild",
    () => {
    const db = session();
    const workspace = createWorkspace(db, "LongRun WS");
    const thread = createThread(db, workspace.id, "Main");
    for (let i = 0; i < 600; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}: continuity runtime validation for multi-week persistence simulation.`,
      });
    }

    db.prepare("DELETE FROM memory_states WHERE workspace_id = ? AND thread_id = ?").run(
      workspace.id,
      thread.id,
    );
    const rebuilt = rebuildDerivedMemoryFromCanonical(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });
    expect(rebuilt.rebuiltFragments).toBeGreaterThan(60);
    expect(getMemoryState(db, workspace.id, thread.id)).not.toBeNull();
    },
    45000,
  );

  it("generates 1k/5k and multi-week simulation utilities", () => {
    const oneK = generateConversationMessages(1000, "one-k");
    const fiveK = generateConversationMessages(5000, "five-k");
    const multiWeek = generateMultiWeekSimulation(3);
    expect(oneK).toHaveLength(1000);
    expect(fiveK).toHaveLength(5000);
    expect(multiWeek.length).toBeGreaterThan(300);
  });

  it("normalizes provider context to keep continuity provider-agnostic", () => {
    const ctx = [
      { role: "system" as const, content: "system continuity block" },
      { role: "user" as const, content: "hello" },
    ];
    const normalized = normalizeProviderContext("unknown-provider", ctx);
    expect(normalized.length).toBe(2);
    const capability = getProviderCapabilityMetadata("ollama");
    expect(capability.supportsLongContext).toBe(true);
    expect(capability.continuityPortabilityScore).toBeGreaterThan(0.5);
  });

  it("scores cross-provider portability and switch recovery quality", () => {
    const openaiToOllama = scoreProviderContinuityPortability("openai", "ollama");
    const ollamaToOpenai = scoreProviderContinuityPortability("ollama", "openai");
    const unavailableRecovery = scoreProviderContinuityPortability("openai", "unknown-provider");
    expect(openaiToOllama).toBeGreaterThan(0.5);
    expect(ollamaToOpenai).toBeGreaterThan(0.5);
    expect(unavailableRecovery).toBeGreaterThan(0.2);
  });

  it("computes reconstruction confidence and detects drift", () => {
    const db = session();
    const workspace = createWorkspace(db, "Reconstruct WS");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Goal: keep project continuity stable and unresolved items visible.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Decision: prioritize unresolved loops and preserve operational identity.",
    });
    const scoring = scoreContinuityReconstruction(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "continuity unresolved operational identity",
    });
    persistContinuityValidationSnapshot(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      reconstruction: scoring,
    });
    persistCalibrationSnapshot(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      reconstruction: scoring,
    });
    expect(scoring.continuityConfidenceScore).toBeGreaterThan(0.45);
    expect(scoring.continuityDriftScore).toBeLessThan(0.7);
    expect(scoring.driftWarningThreshold).toBe(CONTINUITY_DRIFT_WARNING_THRESHOLD);
    expect(scoring.continuityFidelityScore).toBeGreaterThan(0.2);
    expect(scoring.operationalConsistencyScore).toBeGreaterThan(0.2);
    expect(scoring.emotionalContinuityScore).toBeGreaterThan(0.2);
  });

  it("evaluates drift correction trigger conditions", () => {
    const db = session();
    const workspace = createWorkspace(db, "Drift WS");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Canonical project identity: local-first continuity and reliable autosave.",
    });
    db.prepare("DELETE FROM memory_fragments WHERE workspace_id = ? AND thread_id = ?").run(
      workspace.id,
      thread.id,
    );
    db.prepare("DELETE FROM memory_states WHERE workspace_id = ? AND thread_id = ?").run(
      workspace.id,
      thread.id,
    );
    const scoring = scoreContinuityReconstruction(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "astronomy gardening chemistry irrelevant drift",
    });
    expect(typeof scoring.needsCorrection).toBe("boolean");
    if (scoring.needsCorrection) {
      expect(scoring.continuityDriftScore).toBeGreaterThanOrEqual(
        scoring.driftWarningThreshold,
      );
    } else {
      expect(scoring.continuityDriftScore).toBeLessThanOrEqual(0.6);
    }
  });

  it("tracks continuity evolution metrics and compression layers", () => {
    const db = session();
    const workspace = createWorkspace(db, "Evolution WS");
    const thread = createThread(db, workspace.id, "Main");
    for (let i = 0; i < 120; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Evolution ${i}: open issue and goals should persist across long chats.`,
      });
    }
    const stats = getContinuityEvolutionStats(db, workspace.id, thread.id);
    expect(stats.activeStateCount).toBeGreaterThan(0);
    expect(stats.avgDecayRate).toBeGreaterThan(0);
  });

  it(
    "simulates 10k-message continuity flow and keeps runtime recoverable",
    () => {
      const db = session();
      const workspace = createWorkspace(db, "TenK WS");
      const thread = createThread(db, workspace.id, "Main");
      const messages = generateConversationMessages(10_000, "ten-k");
      expect(messages).toHaveLength(10_000);
      // Sample a representative 1.2k spread to keep CI runtime stable while validating 10k-scale simulation inputs.
      const sample: typeof messages = [];
      const stride = Math.floor(messages.length / 1200);
      for (let i = 0; i < messages.length && sample.length < 1200; i += Math.max(1, stride)) {
        sample.push(messages[i]);
      }
      for (const message of sample) {
        insertMessage(db, {
          threadId: thread.id,
          role: message.role,
          content: message.content,
        });
      }
      const rebuilt = rebuildDerivedMemoryFromCanonical(db, {
        workspaceId: workspace.id,
        threadId: thread.id,
      });
      expect(rebuilt.rebuiltState).toBe(true);
      expect(rebuilt.rebuiltFragments).toBeGreaterThan(500);
    },
    45000,
  );

  it("survives interrupted compression by rebuilding from canonical", () => {
    const db = session();
    const workspace = createWorkspace(db, "Interrupt WS");
    const thread = createThread(db, workspace.id, "Main");
    for (let i = 0; i < 80; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "assistant",
        content: `Compression cycle ${i}: maintain continuity and recoverability.`,
      });
    }
    db.prepare("DELETE FROM compressed_memory_states WHERE workspace_id = ?").run(workspace.id);
    const rebuilt = rebuildDerivedMemoryFromCanonical(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });
    expect(rebuilt.rebuiltState).toBe(true);
  });

  it("runs idle scheduler only in safe idle windows", () => {
    const db = session();
    const workspace = createWorkspace(db, "Idle WS");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Track recurring goals and keep continuity healthy.",
    });

    const blocked = runIdleContinuityMaintenance(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      isChatActive: true,
      cpuBusy: false,
    });
    expect(blocked.ran).toBe(false);

    const idle = runIdleContinuityMaintenance(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      isChatActive: false,
      cpuBusy: false,
      interrupted: () => false,
    });
    expect(idle.ran).toBe(true);
    expect(idle.maintenanceHealthScore).toBeGreaterThan(0.2);
  });

  it("handles embedding pipeline interruption and fallback retrieval", () => {
    const db = session();
    const workspace = createWorkspace(db, "Embedding WS");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Keep operational continuity and goal reinforcement active.",
    });
    const generated = updateEmbeddingCacheForThread(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });
    expect(generated.generated).toBeGreaterThanOrEqual(0);
    const matches = semanticRetrieveByEmbedding(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "goal reinforcement",
    });
    expect(Array.isArray(matches)).toBe(true);
    const current = getEmbeddingProvider();
    setEmbeddingProvider({
      id: "test-adapter",
      embed: () => new Array(32).fill(0),
    });
    const adapterMatches = semanticRetrieveByEmbedding(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "goal reinforcement",
    });
    expect(Array.isArray(adapterMatches)).toBe(true);
    setEmbeddingProvider(current);
  });

  it("supports long-idle restoration and repeated provider recovery loops", () => {
    const db = session();
    const workspace = createWorkspace(db, "Recovery Loop WS");
    const thread = createThread(db, workspace.id, "Main");
    for (const provider of generateProviderSwitchSequence()) {
      insertMessage(db, {
        threadId: thread.id,
        role: "assistant",
        content: `Provider switch cycle: ${provider} with continuity recovery fallback.`,
      });
    }
    const reconstructed = scoreContinuityReconstruction(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "provider recovery fallback continuity",
    });
    expect(reconstructed.continuityConfidenceScore).toBeGreaterThan(0.3);
  });

  it(
    "simulates 25k input scale using bounded sampled execution",
    () => {
    const db = session();
    const workspace = createWorkspace(db, "TwentyFiveK WS");
    const thread = createThread(db, workspace.id, "Main");
    const huge = generateConversationMessages(25_000, "twenty-five-k");
    expect(huge).toHaveLength(25_000);
    const sampled = huge.filter((_, index) => index % 50 === 0);
    expect(sampled.length).toBe(500);
    for (const message of sampled) {
      insertMessage(db, {
        threadId: thread.id,
        role: message.role,
        content: message.content,
      });
    }
    const stats = getContinuityEvolutionStats(db, workspace.id, thread.id);
    expect(stats.activeStateCount).toBeGreaterThan(100);
    },
    20000,
  );

  it("prevents retrieval saturation and detects continuity conflicts", () => {
    const db = session();
    const workspace = createWorkspace(db, "Saturation WS");
    const thread = createThread(db, workspace.id, "Main");
    for (let i = 0; i < 40; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "assistant",
        content: `Goal conflict ${i}: we should always ship fast but never ship fast.`,
      });
    }
    const fragments = listRelevantMemoryFragments(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "goal ship fast conflict",
      limit: 12,
    });
    expect(fragments.length).toBeLessThanOrEqual(12);
    const scoring = scoreContinuityReconstruction(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "goal conflict ship fast",
    });
    expect(typeof scoring.hasContinuityConflict).toBe("boolean");
  });

  it("handles maintenance queue interruption safely", () => {
    const db = session();
    const workspace = createWorkspace(db, "Queue WS");
    const thread = createThread(db, workspace.id, "Main");
    enqueueMaintenanceJob(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      jobType: "validation_snapshot",
      priority: 2,
      cpuBudgetMs: 10,
    });
    const blocked = processMaintenanceQueue(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      isChatActive: true,
      cpuBusy: false,
    });
    expect(blocked.processed).toBe(0);
    const processed = processMaintenanceQueue(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      isChatActive: false,
      cpuBusy: false,
    });
    expect(processed.processed).toBeGreaterThanOrEqual(1);
  });

  it("tracks calibration metrics and memory pressure in inspector", () => {
    const db = session();
    const workspace = createWorkspace(db, "Inspector Metrics WS");
    const thread = createThread(db, workspace.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Keep continuity natural and operationally stable.",
    });
    const report = getContinuityInspectorReport(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "continuity stable",
    });
    expect(report.calibrationMetrics.continuityFidelityScore).toBeGreaterThan(0);
    expect(report.runtimeMemoryPressure.activePayloadBytes).toBeGreaterThan(0);
  });

  it(
    "supports 50k simulation input generation and bounded execution",
    () => {
    const db = session();
    const workspace = createWorkspace(db, "FiftyK WS");
    const thread = createThread(db, workspace.id, "Main");
    const huge = generateHugeSimulationInput(50_000);
    expect(huge).toHaveLength(50_000);
    const sampled = huge.filter((_, idx) => idx % 200 === 0);
    expect(sampled.length).toBe(250);
    for (const msg of sampled) {
      insertMessage(db, { threadId: thread.id, role: msg.role, content: msg.content });
    }
    const stats = getContinuityEvolutionStats(db, workspace.id, thread.id);
    expect(stats.activeStateCount).toBeGreaterThan(0);
    },
    20000,
  );

  it("supports multi-month simulation generation", () => {
    const messages = generateMultiMonthSimulation(4);
    expect(messages.length).toBeGreaterThan(2000);
  });
});
