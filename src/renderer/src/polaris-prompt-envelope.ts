import {
  buildPolarisMemoryRecallContext,
  type PolarisMemoryRecallContext,
} from "./polaris-memory-recall";

export type PolarisPromptEnvelopeInput = {
  userVisibleContent: string;
  continuitySummary?: string | null;
  workspaceName?: string | null;
  threadTitle?: string | null;
  includeMemoryRecall?: boolean;
};

export type PolarisPromptEnvelope = {
  userVisibleContent: string;
  hiddenContext: string;
  modelContent: string;
  hasHiddenContext: boolean;
  recall: PolarisMemoryRecallContext;
  safetyNotes: string[];
};

function compactText(value: unknown, maxLength = 800, fallback = "UNKNOWN"): string {
  if (typeof value !== "string") return fallback;

  const compacted = value.replace(/\s+/g, " ").trim();

  if (!compacted) return fallback;
  if (compacted.length <= maxLength) return compacted;

  return `${compacted.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildEnvelopeQuery(input: PolarisPromptEnvelopeInput): string {
  return [
    input.userVisibleContent,
    input.workspaceName,
    input.threadTitle,
    "current user request",
    "related structured memory",
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

export function buildPolarisPromptEnvelope(
  input: PolarisPromptEnvelopeInput
): PolarisPromptEnvelope {
  const userVisibleContent = input.userVisibleContent.trim();
  const recall = buildPolarisMemoryRecallContext({
    query: buildEnvelopeQuery(input),
    continuitySummary: input.continuitySummary,
    limit: 3,
  });

  const shouldIncludeRecall = input.includeMemoryRecall !== false && recall.hasRecall;

  const safetyNotes = [
    "The user-facing assistant identity remains Polaris.",
    "Background agents and memory recall are internal context, not selectable assistants.",
    "Do not invent missing memory when recall has no match.",
    "Do not save internal context as the visible user message.",
  ];

  const hiddenContext = shouldIncludeRecall
    ? [
        "## Hidden Polaris Prompt Context",
        "- Visibility: hidden from normal chat UI",
        "- Purpose: help Polaris answer with relevant continuity memory",
        "- User-facing rule: user chats with Polaris only",
        "- Storage rule: userVisibleContent is the visible message; hiddenContext is not the visible user message",
        "",
        recall.hiddenContextBlock,
      ].join("\n")
    : [
        "## Hidden Polaris Prompt Context",
        "- Visibility: hidden from normal chat UI",
        "- Recall status: no attached structured memory recall",
        "- User-facing rule: user chats with Polaris only",
        "- Storage rule: do not invent missing memory",
      ].join("\n");

  const modelContent = [
    hiddenContext,
    "",
    "## User Message",
    compactText(userVisibleContent, 8000, ""),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    userVisibleContent,
    hiddenContext,
    modelContent,
    hasHiddenContext: shouldIncludeRecall,
    recall,
    safetyNotes,
  };
}

export function buildPolarisModelContentWithHiddenRecall(
  input: PolarisPromptEnvelopeInput
): string {
  return buildPolarisPromptEnvelope(input).modelContent;
}

export function getPolarisVisibleUserContent(input: PolarisPromptEnvelopeInput): string {
  return buildPolarisPromptEnvelope(input).userVisibleContent;
}

export function shouldAttachHiddenPromptContext(input: PolarisPromptEnvelopeInput): boolean {
  return buildPolarisPromptEnvelope(input).hasHiddenContext;
}
