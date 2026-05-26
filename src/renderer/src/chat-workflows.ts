import type { ContinuityImportPreview, Message } from "@shared/types";
import type { GuidanceState } from "./guided-routines";

export type ChatWorkflowType =
  | "none"
  | "import_memory"
  | "import_memory_preview"
  | "continue_any_ai"
  | "paste_ai_response"
  | "review_memory"
  | "backup_export"
  | "create_memory_update"
  | "setup_local_ai";

export type ActiveChatWorkflow = Exclude<ChatWorkflowType, "none">;

export type ChatWorkflowSession = {
  kind: ChatWorkflowType;
  sourceUserMessageId: string | null;
  requestText: string | null;
  note: string | null;
  targetPlatform: string;
};

export type ChatIntentRoute =
  | { kind: "none" }
  | { kind: "guidance" }
  | { kind: "workflow"; workflow: ActiveChatWorkflow };

export type ChatWorkflowDefinition = {
  title: string;
  prompt: string;
  inputPlaceholder?: string | null;
  primaryActionLabel?: string | null;
  secondaryActionLabel?: string | null;
};

export type ImportPreviewSummary = {
  source: string;
  projectName: string;
  currentObjective: string;
  continuitySummary: string;
  stableFactsCount: number;
  decisionsCount: number;
  openIssuesCount: number;
  nextStepsCount: number;
  stableFactsExample: string | null;
  decisionsExample: string | null;
  openIssuesExample: string | null;
  nextStepsExample: string | null;
};

type ContextPackRequestHintInput = {
  explicitRequestText?: string | null;
  messages?: Pick<Message, "role" | "content">[] | null;
  guidanceState?: GuidanceState;
  continuitySummary?: string | null;
  importedSource?: string | null;
};

const NO_ROUTE: ChatIntentRoute = { kind: "none" };
const GUIDANCE_ROUTE: ChatIntentRoute = { kind: "guidance" };

function normalizeIntentText(input: string): string {
  return input.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hasAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function routeChatIntent(
  input: string,
  guidanceState: GuidanceState = "welcome",
): ChatIntentRoute {
  const normalized = normalizeIntentText(input);
  if (!normalized) return NO_ROUTE;

  if (
    hasAnyPhrase(normalized, [
      "import memory",
      "import markdown",
      "paste memory",
      "import a memory file",
      "import the memory file",
    ])
  ) {
    return { kind: "workflow", workflow: "import_memory" };
  }

  if (
    hasAnyPhrase(normalized, [
      "continue in any ai",
      "context pack",
      "copy context pack",
      "continue elsewhere",
    ])
  ) {
    return { kind: "workflow", workflow: "continue_any_ai" };
  }

  if (
    hasAnyPhrase(normalized, [
      "paste response",
      "save response",
      "paste ai response",
      "save ai response",
    ])
  ) {
    return { kind: "workflow", workflow: "paste_ai_response" };
  }

  if (
    hasAnyPhrase(normalized, [
      "review memory",
      "what do you know",
      "review project memory",
      "what do we know",
    ])
  ) {
    return { kind: "workflow", workflow: "review_memory" };
  }

  if (
    hasAnyPhrase(normalized, [
      "update memory",
      "create memory update",
      "make a memory update",
      "compress memory",
      "compress this chat",
    ])
  ) {
    return { kind: "workflow", workflow: "create_memory_update" };
  }

  if (
    hasAnyPhrase(normalized, [
      "backup",
      "back up",
      "export",
      "backup my workspace",
      "export my workspace",
    ])
  ) {
    return { kind: "workflow", workflow: "backup_export" };
  }

  if (
    hasAnyPhrase(normalized, [
      "setup local ai",
      "set up local ai",
      "local ai",
      "ollama",
      "setup ollama",
      "set up ollama",
    ])
  ) {
    return { kind: "workflow", workflow: "setup_local_ai" };
  }

  if (
    hasAnyPhrase(normalized, ["what do i do next", "what next", "help", "show help"])
  ) {
    return GUIDANCE_ROUTE;
  }

  return NO_ROUTE;
}

export function isChatWorkflowCommand(input: string): boolean {
  return routeChatIntent(input).kind !== "none";
}

export function createChatWorkflowSession(
  kind: ChatWorkflowType,
  options: Partial<Omit<ChatWorkflowSession, "kind">> = {},
): ChatWorkflowSession {
  return {
    kind,
    sourceUserMessageId: options.sourceUserMessageId ?? null,
    requestText: options.requestText ?? null,
    note: options.note ?? null,
    targetPlatform: options.targetPlatform ?? "AI Handoff",
  };
}

export function getContextPackRequestHint(
  input: ContextPackRequestHintInput = {},
): string {
  const explicit = input.explicitRequestText?.trim();
  if (explicit) return explicit;

  const guidanceState = input.guidanceState ?? "welcome";
  const latestUser = (input.messages ?? [])
    .slice()
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        message.content.trim().length > 0 &&
        routeChatIntent(message.content, guidanceState).kind === "none",
    );
  if (latestUser) {
    return latestUser.content.trim();
  }

  const summaryLine = input.continuitySummary?.trim().split(/\n+/)[0]?.trim();
  if (summaryLine) {
    return summaryLine;
  }

  if (input.importedSource?.trim()) {
    return `Continue this project using the latest ContinuityOS memory imported from ${input.importedSource.trim()}.`;
  }

  return "Continue this project from the latest saved ContinuityOS memory.";
}

export function getChatWorkflowDefinition(kind: ActiveChatWorkflow): ChatWorkflowDefinition {
  switch (kind) {
    case "import_memory":
      return {
        title: "Import Memory",
        prompt:
          "Sure. Paste the ContinuityOS Markdown Memory File here and I will preview it before applying anything.",
        inputPlaceholder: "Paste your .md memory file here...",
        primaryActionLabel: "Preview Import",
        secondaryActionLabel: "Cancel",
      };
    case "import_memory_preview":
      return {
        title: "Import Preview",
        prompt:
          "I found a markdown memory file. Review the summary below, then choose how you want to apply it.",
      };
    case "continue_any_ai":
      return {
        title: "Advanced AI Handoff",
        prompt:
          "I can export an advanced project handoff from this workspace and thread if you need to continue outside ContinuityOS.",
        primaryActionLabel: "Copy Project Handoff",
        secondaryActionLabel: "Show Preview",
      };
    case "paste_ai_response":
      return {
        title: "Paste AI Response",
        prompt:
          "Paste a reply from an external AI below and I will save it into this thread without duplicating your user message.",
        inputPlaceholder: "Paste the AI response here...",
        primaryActionLabel: "Save Response",
        secondaryActionLabel: "Cancel",
      };
    case "review_memory":
      return {
        title: "Review Project Memory",
        prompt:
          "Here is the latest project memory ContinuityOS can carry into the next Ollama chat or advanced handoff export.",
      };
    case "backup_export":
      return {
        title: "Back Up / Export",
        prompt:
          "I can help you export markdown backups right here, or open the larger backup tools when you need a full workspace export.",
      };
    case "create_memory_update":
      return {
        title: "Create Memory Update",
        prompt:
          "I can compress the latest local conversation into a reviewable markdown project-state file before anything is applied.",
      };
    case "setup_local_ai":
      return {
        title: "Ollama Setup",
        prompt:
          "Ollama is required for in-app AI replies. I can check whether Ollama is reachable on this machine and help you select a local model.",
      };
  }
}

function firstOrNull(items: string[]): string | null {
  return items[0] ?? null;
}

export function summarizeImportPreview(preview: ContinuityImportPreview): ImportPreviewSummary {
  return {
    source: preview.source,
    projectName: preview.projectName,
    currentObjective: preview.currentObjective,
    continuitySummary: preview.continuitySummary,
    stableFactsCount: preview.stableFacts.length,
    decisionsCount: preview.decisionsMade.length,
    openIssuesCount: preview.openIssues.length,
    nextStepsCount: preview.nextSteps.length,
    stableFactsExample: firstOrNull(preview.stableFacts),
    decisionsExample: firstOrNull(preview.decisionsMade),
    openIssuesExample: firstOrNull(preview.openIssues),
    nextStepsExample: firstOrNull(preview.nextSteps),
  };
}
