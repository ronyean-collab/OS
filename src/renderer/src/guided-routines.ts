export type GuidanceState =
  | "welcome"
  | "memory_imported"
  | "context_pack_ready"
  | "context_pack_copied"
  | "response_saved"
  | "backup_recommended"
  | "local_ai_available"
  | "local_ai_unavailable";

export type GuidanceActionId =
  | "continue_any_ai"
  | "copy_context_pack"
  | "show_context_pack_again"
  | "paste_ai_response"
  | "import_memory"
  | "review_project_memory"
  | "backup_export"
  | "set_up_local_ai"
  | "help"
  | "continue_chatting"
  | "create_memory_update";

export type GuidanceAction = {
  id: GuidanceActionId;
  label: string;
  tone?: "primary" | "secondary";
};

export type GuidanceCard = {
  state: GuidanceState;
  title: string;
  body: string;
  footer?: string | null;
  actions: GuidanceAction[];
};

export type GuidanceContext = {
  importedSource?: string | null;
  localAiDetected?: boolean | null;
  providerReady?: boolean;
};

export type GuidanceEvent =
  | "workspace_opened"
  | "memory_imported"
  | "message_saved_without_provider"
  | "context_pack_copied"
  | "manual_response_saved"
  | "backup_recommended"
  | "local_ai_detected"
  | "local_ai_missing";

export function getNextStepActions(state: GuidanceState): GuidanceAction[] {
  switch (state) {
    case "memory_imported":
      return [
        { id: "copy_context_pack", label: "Copy Context Pack", tone: "primary" },
        { id: "review_project_memory", label: "Review Imported Memory" },
        { id: "backup_export", label: "Export Backup" },
        { id: "continue_chatting", label: "Continue Chatting" },
      ];
    case "context_pack_ready":
      return [
        { id: "set_up_local_ai", label: "Set Up Local AI", tone: "primary" },
        { id: "continue_any_ai", label: "Continue in Any AI" },
        { id: "help", label: "Help" },
      ];
    case "context_pack_copied":
      return [
        { id: "paste_ai_response", label: "Paste AI Response", tone: "primary" },
        { id: "show_context_pack_again", label: "Show Context Pack Again" },
        { id: "review_project_memory", label: "Review Project Memory" },
      ];
    case "response_saved":
      return [
        { id: "create_memory_update", label: "Create Memory Update", tone: "primary" },
        { id: "continue_chatting", label: "Continue Chatting" },
        { id: "backup_export", label: "Export Backup" },
      ];
    case "backup_recommended":
      return [
        { id: "backup_export", label: "Back Up / Export", tone: "primary" },
        { id: "review_project_memory", label: "Review Project Memory" },
        { id: "continue_chatting", label: "Continue Chatting" },
      ];
    case "local_ai_available":
      return [
        { id: "set_up_local_ai", label: "Set Up Local AI" },
        { id: "continue_any_ai", label: "Continue in Any AI" },
        { id: "review_project_memory", label: "Review Project Memory" },
        { id: "continue_chatting", label: "Continue Chatting", tone: "primary" },
      ];
    case "local_ai_unavailable":
      return [
        { id: "set_up_local_ai", label: "Set Up Local AI" },
        { id: "continue_any_ai", label: "Continue in Any AI", tone: "primary" },
        { id: "help", label: "Help" },
      ];
    case "welcome":
    default:
      return [
        { id: "continue_chatting", label: "Continue Chatting", tone: "primary" },
        { id: "set_up_local_ai", label: "Set Up Local AI" },
        { id: "import_memory", label: "Import Memory" },
        { id: "continue_any_ai", label: "Continue in Any AI" },
      ];
  }
}

export function getWorkspaceGuidance(context: GuidanceContext = {}): GuidanceCard {
  const localAiNote =
    context.localAiDetected === true
      ? " Ollama is available on this machine if you want to keep replies local."
      : context.localAiDetected === false
        ? " If local AI is not ready yet, you can still continue with a Context Pack."
        : "";

  return {
    state: "welcome",
    title: "ContinuityOS Guide",
    body: `I can help with memory import, backups, Context Packs, project memory review, and Local AI setup.${localAiNote}`,
    footer: "Guide messages stay secondary unless you ask for help or need a workflow.",
    actions: getNextStepActions("welcome"),
  };
}

export function getPostImportGuidance(context: GuidanceContext = {}): GuidanceCard {
  const sourceNote = context.importedSource?.trim()
    ? ` I updated this workspace with the project state you pasted from ${context.importedSource.trim()}.`
    : " I updated this workspace with the project state you pasted.";

  return {
    state: "memory_imported",
    title: "Memory imported.",
    body: `${sourceNote} The next step is to copy a Context Pack so a new AI chat can pick up from here.`,
    footer:
      "Context Pack = what you paste into ChatGPT, Claude, Gemini, Ollama, or another AI so it can continue from your ContinuityOS memory.",
    actions: getNextStepActions("memory_imported"),
  };
}

export function getNoProviderGuidance(context: GuidanceContext = {}): GuidanceCard {
  const localAiLine =
    context.localAiDetected === true
      ? " Start or select Ollama to get in-app replies."
      : "";

  return {
    state: "context_pack_ready",
    title: "I saved that locally.",
    body: `Local AI is not ready yet. Start or select Ollama to get in-app replies, or use a Context Pack with any AI.${localAiLine}`,
    footer: null,
    actions: getNextStepActions("context_pack_ready"),
  };
}

export function getPostContextCopyGuidance(): GuidanceCard {
  return {
    state: "context_pack_copied",
    title: "Context Pack copied.",
    body:
      "Done. Paste it into ChatGPT, Claude, Gemini, Ollama, or another AI. Then paste the AI reply back here and save it.",
    footer:
      "If you want to review the exact handoff again, open the Context Pack preview or copy it again.",
    actions: getNextStepActions("context_pack_copied"),
  };
}

export function getResponseSavedGuidance(): GuidanceCard {
  return {
    state: "response_saved",
    title: "Response saved.",
    body:
      "Saved. Want to create a compressed markdown memory update so future chats remember this progress, or keep chatting from here?",
    footer:
      "If you do not need a memory update yet, you can keep chatting normally and create one later from chat or Project tools.",
    actions: getNextStepActions("response_saved"),
  };
}

export function getBackupRecommendedGuidance(): GuidanceCard {
  return {
    state: "backup_recommended",
    title: "Back up this workspace when you are ready.",
    body:
      "A backup/export gives you a portable checkpoint before more changes, imports, or AI handoffs.",
    actions: getNextStepActions("backup_recommended"),
  };
}

export function getLocalAiGuidance(available: boolean): GuidanceCard {
  return available
    ? {
        state: "local_ai_available",
        title: "Local AI is available.",
        body: "Ollama is ready. You can keep chatting here, or open setup if you want to change models.",
        actions: getNextStepActions("local_ai_available"),
      }
    : {
        state: "local_ai_unavailable",
        title: "Local AI is not ready yet.",
        body: "Start or select Ollama to get in-app replies, or continue with a Context Pack.",
        actions: getNextStepActions("local_ai_unavailable"),
      };
}

export function transitionGuidanceState(
  current: GuidanceState,
  event: GuidanceEvent,
): GuidanceState {
  switch (event) {
    case "memory_imported":
      return "memory_imported";
    case "message_saved_without_provider":
      return "context_pack_ready";
    case "context_pack_copied":
      return "context_pack_copied";
    case "manual_response_saved":
      return "response_saved";
    case "backup_recommended":
      return "backup_recommended";
    case "local_ai_detected":
      return current === "welcome" ? "local_ai_available" : current;
    case "local_ai_missing":
      return current === "welcome" ? "local_ai_unavailable" : current;
    case "workspace_opened":
    default:
      return "welcome";
  }
}

export function resolveGuidanceCard(
  state: GuidanceState,
  context: GuidanceContext = {},
): GuidanceCard {
  switch (state) {
    case "memory_imported":
      return getPostImportGuidance(context);
    case "context_pack_ready":
      return getNoProviderGuidance(context);
    case "context_pack_copied":
      return getPostContextCopyGuidance();
    case "response_saved":
      return getResponseSavedGuidance();
    case "backup_recommended":
      return getBackupRecommendedGuidance();
    case "local_ai_available":
      return getLocalAiGuidance(true);
    case "local_ai_unavailable":
      return getLocalAiGuidance(false);
    case "welcome":
    default:
      return getWorkspaceGuidance(context);
  }
}
