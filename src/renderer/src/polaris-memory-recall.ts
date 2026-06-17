import {
  retrieveStructuredMemoryEventsByScent,
  type StructuredMemoryRetrievalResult,
} from "./project-memory-retrieval";

export type PolarisMemoryRecallInput = {
  query: string;
  continuitySummary?: string | null;
  limit?: number;
};

export type PolarisMemoryRecallContext = {
  query: string;
  hasRecall: boolean;
  isVagueReference: boolean;
  hiddenContextBlock: string;
  topSignals: string[];
  matchedCount: number;
};

function compactText(value: unknown, maxLength = 500, fallback = "UNKNOWN"): string {
  if (typeof value !== "string") return fallback;

  const compacted = value.replace(/\s+/g, " ").trim();

  if (!compacted) return fallback;
  if (compacted.length <= maxLength) return compacted;

  return `${compacted.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function formatRecallResult(result: StructuredMemoryRetrievalResult, index: number): string {
  const event = result.event;

  return [
    `### Recall Match ${index + 1}`,
    `- Title: ${compactText(event.title, 120)}`,
    `- Score: ${result.score}`,
    `- Confidence: ${compactText(event.confidence, 80)}`,
    `- Importance: ${event.importanceScore}/100`,
    `- Latest user intent: ${compactText(event.latestUserIntent, 320)}`,
    `- Latest Polaris result: ${compactText(event.latestPolarisResult, 320)}`,
    `- Retrieval trace: ${compactText(event.digitalScentTrace, 420)}`,
    `- Retrieval phrases: ${event.retrievalPhrases.length > 0 ? event.retrievalPhrases.join(", ") : "none"}`,
    `- Scent tags: ${event.scentTags.length > 0 ? event.scentTags.join(", ") : "none"}`,
    `- Matched signals: ${result.matchedSignals.length > 0 ? result.matchedSignals.join(", ") : "none"}`
  ].join("\n");
}

export function buildPolarisMemoryRecallContext(
  input: PolarisMemoryRecallInput
): PolarisMemoryRecallContext {
  const response = retrieveStructuredMemoryEventsByScent({
    query: input.query,
    continuitySummary: input.continuitySummary,
    limit: input.limit ?? 3,
  });

  const topSignals = uniqueList(
    response.results.flatMap((result) => result.matchedSignals)
  ).slice(0, 10);

  if (response.results.length === 0) {
    return {
      query: input.query,
      hasRecall: false,
      isVagueReference: response.isVagueReference,
      matchedCount: 0,
      topSignals,
      hiddenContextBlock: [
        "## Polaris Memory Recall",
        "- Recall status: no structured memory match",
        `- Query: ${compactText(input.query, 240)}`,
        `- Vague reference: ${response.isVagueReference ? "yes" : "no"}`,
        "- Rule: do not invent missing memory; ask for logs or context if needed."
      ].join("\n"),
    };
  }

  return {
    query: input.query,
    hasRecall: true,
    isVagueReference: response.isVagueReference,
    matchedCount: response.results.length,
    topSignals,
    hiddenContextBlock: [
      "## Polaris Memory Recall",
      "- Recall status: structured memory matched",
      `- Query: ${compactText(input.query, 240)}`,
      `- Vague reference: ${response.isVagueReference ? "yes" : "no"}`,
      `- Summary: ${response.summary}`,
      "- Rule: use recalled memory as context, not as a user-facing agent identity.",
      "- Rule: Polaris remains the only user-facing assistant.",
      "",
      ...response.results.map(formatRecallResult)
    ].join("\n\n"),
  };
}

export function buildPolarisMemoryRecallPromptPrefix(input: PolarisMemoryRecallInput): string {
  return buildPolarisMemoryRecallContext(input).hiddenContextBlock;
}

export function shouldAttachPolarisMemoryRecall(input: PolarisMemoryRecallInput): boolean {
  return buildPolarisMemoryRecallContext(input).hasRecall;
}
