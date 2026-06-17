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
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "review_project_memory", label: "Review Imported Memory" },
        { id: "backup_export", label: "Export Backup" },
        { id: "continue_any_ai", label: "Advanced AI Handoff" },
      ];
    case "context_pack_ready":
      return [
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "backup_export", label: "Backup / Export" },
      ];
    case "context_pack_copied":
      return [
        { id: "paste_ai_response", label: "Paste AI Response", tone: "primary" },
        { id: "show_context_pack_again", label: "Show Handoff Again" },
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
        { id: "set_up_local_ai", label: "AI Settings" },
        { id: "review_project_memory", label: "Review Project Memory" },
        { id: "backup_export", label: "Backup / Export" },
        { id: "continue_chatting", label: "Continue Chatting", tone: "primary" },
      ];
    case "local_ai_unavailable":
      return [
        { id: "set_up_local_ai", label: "Connect AI", tone: "primary" },
        { id: "review_project_memory", label: "Review Memory" },
        { id: "backup_export", label: "Backup / Export" },
      ];
    case "welcome":
    default:
      return [
        { id: "continue_chatting", label: "Start typing", tone: "primary" },
        { id: "set_up_local_ai", label: "Connect AI" },
      ];
  }
}

export function getWorkspaceGuidance(context: GuidanceContext = {}): GuidanceCard {
  const localAiNote =
    context.localAiDetected === true
      ? " You can connect a local AI from Workspace if you want replies here."
      : context.localAiDetected === false
        ? " You can still chat — connect an AI from Workspace whenever you're ready."
        : "";

  return {
    state: "welcome",
    title: "Need a hand?",
    body: `Just type in the box below to get started.${localAiNote}`,
    footer: null,
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
    body: `${sourceNote} ContinuityOS AI will answer here once preparation finishes, or export an advanced AI handoff only if you need to continue outside ContinuityOS.`,
    footer: null,
    actions: getNextStepActions("memory_imported"),
  };
}

export function getNoProviderGuidance(context: GuidanceContext = {}): GuidanceCard {
  const localAiLine =
    context.localAiDetected === true
      ? " ContinuityOS AI is almost ready — you can keep exploring while it finishes."
      : "";

  return {
    state: "context_pack_ready",
    title: "I saved that locally.",
    body: `ContinuityOS AI is still preparing. You can keep chatting — replies will start when your AI is ready.${localAiLine}`,
    footer: null,
    actions: getNextStepActions("context_pack_ready"),
  };
}

export function getPostContextCopyGuidance(): GuidanceCard {
  return {
    state: "context_pack_copied",
    title: "Advanced handoff copied.",
    body:
      "Done. Paste it into the external AI chat you want to use, then paste the reply back here and save it.",
    footer:
      "If you want to review the exact handoff again, open the preview or copy it again.",
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
        title: "ContinuityOS AI is ready.",
        body: "Your AI is ready. You can keep chatting here, or open Settings if you want to change providers.",
        actions: getNextStepActions("local_ai_available"),
      }
    : {
        state: "local_ai_unavailable",
        title: "ContinuityOS AI is preparing.",
        body: "Your AI is getting ready. Memory, backups, and imports still work while preparation finishes.",
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
