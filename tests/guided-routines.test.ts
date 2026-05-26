import { describe, expect, it } from "vitest";
import {
  getNoProviderGuidance,
  getPostContextCopyGuidance,
  getPostImportGuidance,
  getResponseSavedGuidance,
  getWorkspaceGuidance,
  transitionGuidanceState,
} from "../src/renderer/src/guided-routines";

describe("guided routines", () => {
  it("welcome guidance contains the main next-step actions", () => {
    const card = getWorkspaceGuidance({ localAiDetected: false });
    const labels = card.actions.map((action) => action.label);

    expect(card.title).toContain("ContinuityOS Guide");
    expect(labels).toContain("Continue Chatting");
    expect(labels).toContain("Import Memory");
    expect(labels).toContain("Review Memory");
    expect(labels).toContain("Set Up Ollama");
  });

  it("post-import guidance recommends using Ollama or an advanced handoff", () => {
    const card = getPostImportGuidance({ importedSource: "Claude" });

    expect(card.body).toContain("Start Ollama");
    expect(card.actions[0]?.label).toBe("Set Up Ollama");
    expect(card.actions.map((action) => action.label)).toContain("Advanced AI Handoff");
    expect(card.footer).toBeNull();
  });

  it("post-context-pack-copy guidance tells the user to paste into an external AI", () => {
    const card = getPostContextCopyGuidance();

    expect(card.title).toContain("Advanced handoff copied");
    expect(card.body).toContain("Paste it into the external AI chat");
    expect(card.actions.map((action) => action.label)).toContain("Paste AI Response");
  });

  it("response-saved guidance recommends a memory update or backup", () => {
    const card = getResponseSavedGuidance();
    const labels = card.actions.map((action) => action.label);

    expect(card.body).toContain("compressed markdown memory update");
    expect(labels).toContain("Create Memory Update");
    expect(labels).toContain("Export Backup");
    expect(labels).toContain("Continue Chatting");
  });

  it("message-saved-without-provider guidance explains the local-only next step", () => {
    const card = getNoProviderGuidance({ localAiDetected: true });

    expect(card.title).toContain("saved");
    expect(card.body).toContain("Ollama is required for in-app AI replies");
    expect(card.body).toContain("Start or select Ollama");
  });

  it("tracks the guided flow through import, copy, and response save", () => {
    let state = transitionGuidanceState("welcome", "workspace_opened");
    expect(state).toBe("welcome");

    state = transitionGuidanceState(state, "memory_imported");
    expect(state).toBe("memory_imported");

    state = transitionGuidanceState(state, "context_pack_copied");
    expect(state).toBe("context_pack_copied");

    state = transitionGuidanceState(state, "manual_response_saved");
    expect(state).toBe("response_saved");
  });

  it("switches to context-pack-ready after a local-only send", () => {
    const state = transitionGuidanceState("welcome", "message_saved_without_provider");
    expect(state).toBe("context_pack_ready");
  });
});
