import {
  buildPolarisPromptEnvelope,
  type PolarisPromptEnvelope,
} from "./polaris-prompt-envelope";

export type PolarisStreamEnvelopeInput = {
  userVisibleContent: string;
  continuitySummary?: string | null;
  workspaceName?: string | null;
  threadTitle?: string | null;
  includeMemoryRecall?: boolean;
};

export type PolarisStreamEnvelope = {
  visibleUserContent: string;
  modelContent: string;
  hiddenContext: string;
  hasHiddenContext: boolean;
  shouldPersistVisibleOnly: true;
  envelope: PolarisPromptEnvelope;
  safetyRules: string[];
};

function compactText(value: unknown, maxLength = 8000): string {
  if (typeof value !== "string") return "";

  const compacted = value.replace(/\s+/g, " ").trim();

  if (compacted.length <= maxLength) return compacted;

  return `${compacted.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildPolarisStreamEnvelope(
  input: PolarisStreamEnvelopeInput
): PolarisStreamEnvelope {
  const envelope = buildPolarisPromptEnvelope({
    userVisibleContent: input.userVisibleContent,
    continuitySummary: input.continuitySummary,
    workspaceName: input.workspaceName,
    threadTitle: input.threadTitle,
    includeMemoryRecall: input.includeMemoryRecall,
  });

  const visibleUserContent = compactText(envelope.userVisibleContent);

  return {
    visibleUserContent,
    modelContent: envelope.modelContent,
    hiddenContext: envelope.hiddenContext,
    hasHiddenContext: envelope.hasHiddenContext,
    shouldPersistVisibleOnly: true,
    envelope,
    safetyRules: [
      "Persist visibleUserContent as the user message.",
      "Send modelContent to Polaris only when the backend supports hidden model context.",
      "Never display hiddenContext in normal chat UI.",
      "Never save hiddenContext as the visible user message.",
      "Polaris remains the only user-facing assistant.",
    ],
  };
}

export function getVisibleUserContentForPersistence(
  input: PolarisStreamEnvelopeInput
): string {
  return buildPolarisStreamEnvelope(input).visibleUserContent;
}

export function getModelContentForPolaris(
  input: PolarisStreamEnvelopeInput
): string {
  return buildPolarisStreamEnvelope(input).modelContent;
}

export function hasHiddenMemoryRecallForStream(
  input: PolarisStreamEnvelopeInput
): boolean {
  return buildPolarisStreamEnvelope(input).hasHiddenContext;
}

export function serializePolarisStreamEnvelopeForDebug(
  streamEnvelope: PolarisStreamEnvelope
): string {
  return [
    "## Polaris Stream Envelope Debug",
    `- Visible user content length: ${streamEnvelope.visibleUserContent.length}`,
    `- Model content length: ${streamEnvelope.modelContent.length}`,
    `- internal context attached: ${streamEnvelope.hasHiddenContext ? "yes" : "no"}`,
    `- Persist visible only: ${streamEnvelope.shouldPersistVisibleOnly ? "yes" : "no"}`,
    "- Rule: internal context must not appear in normal chat UI.",
  ].join("\n");
}
