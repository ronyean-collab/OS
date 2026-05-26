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
      ? " Start or select Ollama if you want in-app replies here."
      : " Start or select Ollama to get in-app replies here.";

  if (intent === "help") {
    return {
      state: "welcome",
      title: "ContinuityOS Guide",
      body: `I can help with memory import, backups, Context Packs, Local AI setup, and project memory review for ${workspaceLabel}.`,
      footer: null,
      actions: [
        { id: "continue_any_ai", label: "Continue in Any AI", tone: "primary" },
        { id: "import_memory", label: "Import Memory" },
        { id: "set_up_local_ai", label: "Set Up Local AI" },
        { id: "review_project_memory", label: "Review Memory" },
      ],
    };
  }

  if (intent === "next_step") {
    const nextStepBody =
      input.guidanceState === "memory_imported"
        ? "Based on this workspace, the next step is to copy a Context Pack into any AI so the next chat can continue from the imported memory."
        : input.guidanceState === "context_pack_copied"
          ? "The next step is to paste the AI reply back here so I can save it into this thread and help you compress it into memory."
          : "Based on this workspace, your next step is to either get an AI reply through Local AI or copy a Context Pack into any AI. I can also review memory or create a memory update.";
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
        { id: "continue_any_ai", label: "Continue in Any AI", tone: "primary" },
        { id: "set_up_local_ai", label: "Set Up Local AI" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "create_memory_update", label: "Create Memory Update" },
      ],
    };
  }

  if (intent === "why_not_answering") {
    return {
      state: "context_pack_ready",
      title: "I saved that locally.",
      body:
        "Local AI is not ready yet. Start or select Ollama to get in-app replies, or use a Context Pack with any AI.",
      footer: null,
      actions: [
        { id: "set_up_local_ai", label: "Set Up Local AI", tone: "primary" },
        { id: "continue_any_ai", label: "Continue in Any AI" },
        { id: "help", label: "Help" },
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
        { id: "continue_any_ai", label: "Continue in Any AI" },
        { id: "import_memory", label: "Import Memory" },
      ],
    };
  }

  return {
    state: "context_pack_ready",
    title: "I saved your message locally.",
    body: `Local AI is not ready yet. Start or select Ollama to get in-app replies, or use a Context Pack with any AI.${localAiLine}`,
    footer: null,
    actions: [
      { id: "set_up_local_ai", label: "Set Up Local AI", tone: "primary" },
      { id: "continue_any_ai", label: "Continue in Any AI" },
      { id: "help", label: "Help" },
    ],
  };
}
