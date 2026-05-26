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
      ? " Ollama looks available on this machine if you want to answer directly in-app."
      : " To answer directly here, set up Built-in Local AI or use Ollama.";

  if (intent === "help") {
    return {
      state: "welcome",
      title: "ContinuityOS Guide",
      body: `Yes. I can help you import memory, continue ${workspaceLabel} in any AI, review what the workspace knows, back it up, set up Local AI, or create a markdown memory update.`,
      footer:
        "Local guidance is not model output. Your message is saved locally, and you stay in control of what gets copied or applied.",
      actions: [
        { id: "continue_any_ai", label: "Continue in Any AI", tone: "primary" },
        { id: "import_memory", label: "Import Memory" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "create_memory_update", label: "Create Memory Update" },
        { id: "set_up_local_ai", label: "Set Up Local AI" },
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
        "Direct in-app AI replies require a local model. Set up Ollama or Built-in Local AI, or continue through any AI with a Context Pack.",
      footer:
        "ContinuityOS is not pretending a model answered here. This is local guidance so you can choose the next step.",
      actions: [
        { id: "set_up_local_ai", label: "Set Up Local AI", tone: "primary" },
        { id: "continue_any_ai", label: "Continue in Any AI" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "backup_export", label: "Back Up / Export" },
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
    body: `To get an AI-generated answer inside the app, set up Built-in Local AI or use Ollama. You can also continue through any AI with a Context Pack, or review and update project memory first.${localAiLine}`,
    footer:
      "ContinuityOS owns the memory. Models are replaceable, and no fake assistant reply is written into the thread.",
    actions: [
      { id: "set_up_local_ai", label: "Set Up Local AI", tone: "primary" },
      { id: "continue_any_ai", label: "Continue in Any AI" },
      { id: "review_project_memory", label: "Review Memory" },
      { id: "create_memory_update", label: "Create Memory Update" },
    ],
  };
}
