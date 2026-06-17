import type { LocalAiState } from "@shared/types";
import type { GuidanceCard, GuidanceState } from "./guided-routines";

export type ConversationalShellIntent =
  | "help"
  | "next_step"
  | "why_not_answering"
  | "memory"
  | "general_question"
  | "unknown";

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hasAnyPhrase(input: string, phrases: string[]): boolean {
  return phrases.some((phrase) => input.includes(phrase));
}

export function classifyConversationalShellIntent(input: string): ConversationalShellIntent {
  const normalized = normalize(input);
  if (!normalized) {
    return "unknown";
  }

  if (
    hasAnyPhrase(normalized, [
      "help",
      "can you help me",
      "what can you do",
      "how do you work",
      "what are you for",
    ])
  ) {
    return "help";
  }

  if (
    hasAnyPhrase(normalized, [
      "what do i do next",
      "what next",
      "next step",
      "what should i do next",
    ])
  ) {
    return "next_step";
  }

  if (
    hasAnyPhrase(normalized, [
      "why aren t you answering",
      "why are you not answering",
      "why no answer",
      "why didn t you answer",
      "why didnt you answer",
      "no response",
    ])
  ) {
    return "why_not_answering";
  }

  if (
    hasAnyPhrase(normalized, [
      "what do you know",
      "what does this workspace know",
      "what do we know",
      "review memory",
      "review project state",
      "what is in memory",
    ])
  ) {
    return "memory";
  }

  if (/\?$/.test(input.trim()) || hasAnyPhrase(normalized, ["explain", "how", "why", "what"])) {
    return "general_question";
  }

  return "unknown";
}

export function buildConversationalShellCard(input: {
  message: string;
  guidanceState?: GuidanceState;
  localAiDetected?: boolean | null;
  workspaceName?: string | null;
}): GuidanceCard {
  const intent = classifyConversationalShellIntent(input.message);
  const workspaceLabel = input.workspaceName?.trim() || "this workspace";
  const localAiLine =
    input.localAiDetected === true
      ? " ContinuityOS AI is almost ready — you can keep exploring while it finishes."
      : " Your AI is getting ready in the background.";

  if (intent === "help") {
    return {
      state: "welcome",
      title: "ContinuityOS Guide",
      body: `I can help with AI setup, memory import, backups, advanced handoffs, and project memory review for ${workspaceLabel}.`,
      footer: null,
      actions: [
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "import_memory", label: "Import Memory" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "backup_export", label: "Backup / Export" },
      ],
    };
  }

  if (intent === "next_step") {
    const nextStepBody =
      input.guidanceState === "memory_imported"
        ? "Based on this workspace, the next step is to wait for ContinuityOS AI to finish preparing so you can continue here, or export an advanced handoff only if you need another chat tool."
        : input.guidanceState === "context_pack_copied"
          ? "The next step is to paste the AI reply back here so I can save it into this thread and help you compress it into memory."
          : "Based on this workspace, your next step is to let ContinuityOS AI finish preparing for direct replies here. I can also review memory, back up the project, or create a memory update.";
    return {
      state:
        input.guidanceState === "memory_imported"
          ? "memory_imported"
          : input.guidanceState === "context_pack_copied"
            ? "context_pack_copied"
            : "context_pack_ready",
      title: "Next step",
      body: `${nextStepBody}${localAiLine}`,
      actions: [
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "create_memory_update", label: "Create Memory Update" },
        { id: "backup_export", label: "Backup / Export" },
      ],
    };
  }

  if (intent === "why_not_answering") {
    return {
      state: "context_pack_ready",
      title: "I saved that locally.",
      body:
        "ContinuityOS AI is still preparing. You can keep chatting — replies will start when your AI is ready. Your local memory, imports, and backups are still available.",
      footer: null,
      actions: [
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "backup_export", label: "Backup / Export" },
      ],
    };
  }

  if (intent === "memory") {
    return {
      state: "welcome",
      title: "Project memory",
      body:
        "I can show the latest saved project memory, including the current objective, summary, decisions, open issues, next steps, and visible memory levels.",
      actions: [
        { id: "review_project_memory", label: "Review Memory", tone: "primary" },
        { id: "create_memory_update", label: "Create Memory Update" },
        { id: "import_memory", label: "Import Memory" },
        { id: "backup_export", label: "Backup / Export" },
      ],
    };
  }

  return {
    state: "context_pack_ready",
    title: "I saved your message locally.",
    body: `ContinuityOS AI is still preparing. You can keep chatting — replies will start when your AI is ready. Your local memory, imports, and backups are still available.${localAiLine}`,
    footer: null,
    actions: [
      { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
      { id: "review_project_memory", label: "Review Memory" },
      { id: "backup_export", label: "Backup / Export" },
    ],
  };
}

export function buildChatFailureCard(input: {
  baseUrl?: string | null;
  error?: string | null;
  localAiState?: LocalAiState | null;
  providerReady?: boolean;
  selectedModel?: string | null;
}): GuidanceCard {
  const readyForChat =
    input.providerReady === true ||
    (input.localAiState === "ollama_ready" && Boolean(input.selectedModel?.trim()));

  if (!readyForChat) {
    return {
      state: "context_pack_ready",
      title: "I saved your message locally.",
      body:
        "ContinuityOS AI is still preparing. You can keep chatting — replies will start when your AI is ready. Your local memory, imports, and backups are still available.",
      footer: null,
      actions: [
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "backup_export", label: "Backup / Export" },
      ],
    };
  }

  return {
    state: "local_ai_available",
    title: "AI reply failed",
    body:
      "Your message was saved locally, but ContinuityOS AI could not finish a reply. Retry in chat, or open Settings to check AI status.",
    footer: input.error?.trim() ? `Last error: ${input.error.trim()}` : null,
    actions: [
      { id: "continue_chatting", label: "Retry in Chat", tone: "primary" },
      { id: "set_up_local_ai", label: "Connect AI" },
      { id: "review_project_memory", label: "Review Memory" },
    ],
  };
}
