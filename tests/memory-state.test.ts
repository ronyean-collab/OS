import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage, listMessages } from "../electron/main/services/message-service";
import {
  getCompressionCandidates,
  getMemoryState,
  listRelevantMemoryFragments,
  processMemoryForMessageNonBlocking,
  rebuildDerivedMemoryFromCanonical,
} from "../electron/main/services/memory-state-service";
import {
  archiveThread,
  softDeleteThreadAndRepair,
} from "../electron/main/services/thread-management-service";

describe("memory state autosave foundation", () => {
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

  it("creates memory fragments from saved messages", () => {
    const db = session();
    const workspace = createWorkspace(db, "Memory WS");
    const thread = createThread(db, workspace.id, "Thread");
    const message = insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "I prefer simple UX. The goal is to implement local-first continuity.",
    });

    const rows = db
      .prepare(
        "SELECT fragment_type, source_message_id FROM memory_fragments WHERE thread_id = ? ORDER BY created_at DESC",
      )
      .all(thread.id) as Array<{ fragment_type: string; source_message_id: string }>;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.source_message_id === message.id)).toBe(true);
    expect(rows.some((row) => row.fragment_type === "user_preference")).toBe(true);
    expect(rows.some((row) => row.fragment_type === "project_goal")).toBe(true);
  });

  it("updates rolling memory state after meaningful messages", () => {
    const db = session();
    const workspace = createWorkspace(db, "State WS");
    const thread = createThread(db, workspace.id, "Thread");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "We decided to keep the app local-first and preserve reliability.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Next step: implement continuity memory autosave without deleting canonical messages.",
    });

    const state = getMemoryState(db, workspace.id, thread.id);
    expect(state).not.toBeNull();
    expect(state?.decisions.join(" ")).toMatch(/decided|keep/i);
    expect(state?.recentSummary).toMatch(/continuity|memory/i);
  });

  it("stores stable user preferences in user profile memory", () => {
    const db = session();
    const workspace = createWorkspace(db, "Profile WS");
    const thread = createThread(db, workspace.id, "Thread");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "I prefer a chat-first experience and I want local-first continuity.",
    });

    const rows = db
      .prepare(
        "SELECT preference_key, preference_value, source_message_id FROM user_profile_memory WHERE workspace_id = ?",
      )
      .all(workspace.id) as Array<{
      preference_key: string;
      preference_value: string;
      source_message_id: string;
    }>;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.source_message_id.length > 0)).toBe(true);
    expect(rows.some((row) => row.preference_value.toLowerCase().includes("chat-first"))).toBe(true);
    expect(rows.some((row) => row.preference_key.includes("_preference_"))).toBe(true);
  });

  it("creates memory savepoints by threshold or interval", () => {
    const db = session();
    const workspace = createWorkspace(db, "Savepoint WS");
    const thread = createThread(db, workspace.id, "Thread");
    for (let index = 0; index < 10; index += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content: `Decision ${index}: keep continuity autosave safe and local.`,
      });
    }

    const rows = db
      .prepare(
        "SELECT reason, recent_message_checkpoint, continuity_state_snapshot_json FROM memory_savepoints WHERE workspace_id = ? ORDER BY created_at DESC",
      )
      .all(workspace.id) as Array<{
      reason: string;
      recent_message_checkpoint: string;
      continuity_state_snapshot_json: string;
    }>;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.reason === "message_threshold" || row.reason === "autosave_interval")).toBe(true);
    expect(rows[0].recent_message_checkpoint.length).toBeGreaterThan(0);
    expect(rows[0].continuity_state_snapshot_json).toContain("recentSummary");
  });

  it("keeps memory references tied to source messages", () => {
    const db = session();
    const workspace = createWorkspace(db, "Reference WS");
    const thread = createThread(db, workspace.id, "Thread");
    const message = insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Please keep steps copy/paste-ready and do not delete canonical history.",
    });

    const fragments = listRelevantMemoryFragments(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "copy paste canonical",
    });
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.every((fragment) => fragment.sourceMessageId === message.id)).toBe(true);
    expect(fragments[0].reinforcementCount).toBeGreaterThanOrEqual(0);
  });

  it("applies recency/importance/open-loop weighting in relevance ranking", () => {
    const db = session();
    const workspace = createWorkspace(db, "Relevance WS");
    const thread = createThread(db, workspace.id, "Thread");

    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Open issue: memory rebuild checkpoint still pending?",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Decision: keep canonical messages untouched.",
    });
    const results = listRelevantMemoryFragments(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
      query: "pending memory checkpoint",
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fragmentType).toBe("open_loop");
    expect(results[0].continuityCategory).toBe("open_loop");
  });

  it("creates compression candidates for older low-priority fragments", () => {
    const db = session();
    const workspace = createWorkspace(db, "Compression WS");
    const thread = createThread(db, workspace.id, "Thread");
    for (let i = 0; i < 20; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "assistant",
        content: `Fact ${i}: system has context windows and summary cache.`,
      });
    }
    const candidates = getCompressionCandidates(db, workspace.id, thread.id);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("rebuilds derived continuity from canonical messages", () => {
    const db = session();
    const workspace = createWorkspace(db, "Rebuild WS");
    const thread = createThread(db, workspace.id, "Thread");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Goal: restore continuity from canonical chat records.",
    });
    db.prepare("DELETE FROM memory_states WHERE workspace_id = ? AND thread_id = ?").run(
      workspace.id,
      thread.id,
    );
    db.prepare("DELETE FROM memory_fragments WHERE workspace_id = ? AND thread_id = ?").run(
      workspace.id,
      thread.id,
    );
    const rebuilt = rebuildDerivedMemoryFromCanonical(db, {
      workspaceId: workspace.id,
      threadId: thread.id,
    });
    expect(rebuilt.rebuiltFragments).toBeGreaterThan(0);
    expect(rebuilt.rebuiltState).toBe(true);
  });

  it("archived or deleted threads do not break memory derivation calls", () => {
    const db = session();
    const workspace = createWorkspace(db, "Hidden Threads WS");
    const thread = createThread(db, workspace.id, "Thread");
    const message = insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "I prefer reliability and recoverability above all else.",
    });

    archiveThread(db, thread.id);
    softDeleteThreadAndRepair(db, thread.id);

    expect(() =>
      processMemoryForMessageNonBlocking(db, {
        workspaceId: workspace.id,
        threadId: thread.id,
        messageId: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }),
    ).not.toThrow();
  });

  it("chat persistence still works when memory generation fails", () => {
    const db = session();
    const workspace = createWorkspace(db, "Failure WS");
    const thread = createThread(db, workspace.id, "Thread");

    db.exec("DROP TABLE memory_fragments");
    const persisted = insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "This should still be saved even if memory derivation fails.",
    });

    const messages = listMessages(db, thread.id);
    expect(messages.some((message) => message.id === persisted.id)).toBe(true);
  });

  it("never deletes canonical raw messages while deriving memory", () => {
    const db = session();
    const workspace = createWorkspace(db, "Canonical WS");
    const thread = createThread(db, workspace.id, "Thread");
    for (let index = 0; index < 5; index += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `Canonical message ${index}`,
      });
    }

    const count = db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?")
      .get(thread.id) as { c: number };
    expect(count.c).toBe(5);
  });
});
