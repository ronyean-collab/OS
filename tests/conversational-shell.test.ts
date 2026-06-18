import { describe, expect, it } from "vitest";
import {
  buildChatFailureCard,
  buildConversationalShellCard,
  classifyConversationalShellIntent,
} from "../src/renderer/src/conversational-shell";
import { routeChatIntent } from "../src/renderer/src/chat-workflows";

describe("conversational shell", () => {
  it("classifies help and next-step prompts", () => {
    expect(classifyConversationalShellIntent("can you help me")).toBe("help");
    expect(classifyConversationalShellIntent("what do I do next?")).toBe("next_step");
  });

  it("classifies no-response and general-question prompts", () => {
    expect(classifyConversationalShellIntent("why aren't you answering")).toBe(
      "why_not_answering",
    );
    expect(classifyConversationalShellIntent("How should I structure this feature?")).toBe(
      "general_question",
    );
  });

  it("builds a local guide response for help without faking model output", () => {
    const card = buildConversationalShellCard({
      message: "can you help me?",
      workspaceName: "ContinuityOS Desktop",
      localAiDetected: false,
    });

    expect(card.title).toContain("ContinuityOS Guide");
    expect(card.body).toContain("memory import");
    expect(card.actions.map((action) => action.label)).toContain("Connect AI");
    expect(card.footer).toBeNull();
  });

  it("builds no-engine guidance for unknown questions", () => {
    const card = buildConversationalShellCard({
      message: "Please explain this bug in the app.",
      guidanceState: "welcome",
      localAiDetected: false,
    });

    expect(card.title).toContain("saved");
    expect(card.body).toContain("ContinuityOS AI is still preparing");
    expect(card.actions.map((action) => action.label)).toContain("Connect AI");
    expect(card.actions.map((action) => action.label)).toContain("Backup / Export");
  });

  it("shows a compact AI failure guide when ready chat routing fails", () => {
    const card = buildChatFailureCard({
      localAiState: "ollama_ready",
      providerReady: true,
      selectedModel: "llama3.1:latest",
      baseUrl: "http://127.0.0.1:11500",
      error: "connect ECONNREFUSED 127.0.0.1:11500",
    });

    expect(card.title).toContain("reply failed");
    expect(card.body).toContain("ContinuityOS AI");
    expect(card.actions.map((action) => action.label)).toContain("Retry in Chat");
    expect(card.actions.map((action) => action.label)).toContain("Connect AI");
    expect(card.footer).toContain("ECONNREFUSED");
  });

  it("keeps setup guidance when AI is not ready", () => {
    const card = buildChatFailureCard({
      localAiState: "ollama_not_detected",
      providerReady: false,
      error: "Ollama is required for AI replies.",
    });

    expect(card.title).toContain("saved");
    expect(card.body).toContain("ContinuityOS AI is still preparing");
    expect(card.actions.map((action) => action.label)).toContain("Connect AI");
  });

  it("keeps workflow commands out of the conversational fallback path", () => {
    expect(routeChatIntent("import memory")).toEqual({
      kind: "workflow",
      workflow: "import_memory",
    });
    expect(routeChatIntent("update memory")).toEqual({
      kind: "workflow",
      workflow: "create_memory_update",
    });
  });
});
