
function isHiddenInfrastructureMessage(message: Message): boolean {
  const content = message.content.trim();
  return (
    content.startsWith("# RESTORED_MEMORY_PIN") ||
    content.startsWith("# RESTORED_CONTINUITYOS_SAVE_POINT")
  );
}

function extractLatestRestoredMemoryPin(messages: Message[]): string | null {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const latest = [...sorted]
    .reverse()
    .find((message) => message.content.trim().startsWith("# RESTORED_MEMORY_PIN"));

  if (!latest) return null;

  const content = latest.content.trim();
  const bounded = content.length > 8000 ? content.slice(0, 8000) : content;

  return [
    "RESTORED THREAD MEMORY:",
    "The following hidden restored memory was imported from a ContinuityOS save point.",
    "Use it as durable context for this restored thread.",
    "When the user asks about preferences, facts, prior work, or project state, answer from this memory when possible.",
    "",
    bounded,
  ].join("\n");
}
import type { Message } from "../../../src/shared/types";
import type { ProviderMessage } from "../providers/types";

/** Default recent window â€” truncation hook for Phase 3+. */
export const DEFAULT_CONTEXT_MESSAGE_LIMIT = 40;

/** Max chars stored/sent for user-editable continuity summary. */
export const MAX_CONTINUITY_SUMMARY_CHARS = 8000;

/**
 * Deterministic recent-message context for provider requests.
 * No semantic retrieval â€” chronological tail of thread only.
 */
export function assembleThreadContext(
  messages: Message[],
  options?: { maxMessages?: number },
): { messages: ProviderMessage[]; estimatedTokens: number } {
  const limit = options?.maxMessages ?? DEFAULT_CONTEXT_MESSAGE_LIMIT;
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const recent = sorted.filter((message) => !isHiddenInfrastructureMessage(message)).slice(-limit);
  const providerMessages: ProviderMessage[] = [];

  for (const m of recent) {
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") {
      continue;
    }
    const content = m.content.trim();
    if (!content && m.role !== "assistant") continue;
    providerMessages.push({ role: m.role, content: content || " " });
  }

  const estimatedTokens = estimateTokensPlaceholder(providerMessages);
  return { messages: providerMessages, estimatedTokens };
}

export type AssembleProviderContextInput = {
  workspaceName: string;
  assistantIdentityPrompt?: string | null;
  /** Phase 15 â€” curated relevance layer (before AI Life / intelligence / memory). */
  awarenessContextBlock?: string | null;
  aiLifeAwarenessBlock?: string | null;
  continuityIntelligenceBlock?: string | null;
  continuitySummary?: string | null;
  importedContextBlock?: string | null;
  memoryStateBlock?: string | null;
  relevantFragmentsBlock?: string | null;
  continuityFeelingBlock?: string | null;
  webContextBlock?: string | null;
  messages: Message[];
  maxMessages?: number;
};

/**
 * Builds provider context: optional workspace identity + continuity summary,
 * then bounded recent thread messages. Summary never replaces canonical messages.
 */
export function assembleProviderContext(
  input: AssembleProviderContextInput,
): { messages: ProviderMessage[]; estimatedTokens: number } {
  const { messages: threadMessages } = assembleThreadContext(input.messages, {
    maxMessages: input.maxMessages,
  });

  const rawSummary = input.continuitySummary?.trim() ?? "";
  const identityPrompt = input.assistantIdentityPrompt?.trim() ?? "";
  const boundedSummary =
    rawSummary.length > MAX_CONTINUITY_SUMMARY_CHARS
      ? rawSummary.slice(0, MAX_CONTINUITY_SUMMARY_CHARS)
      : rawSummary;
  const awarenessContext = input.awarenessContextBlock?.trim() ?? "";
  const aiLifeAwareness = input.aiLifeAwarenessBlock?.trim() ?? "";
  const continuityIntelligence = input.continuityIntelligenceBlock?.trim() ?? "";
  const importedContext = input.importedContextBlock?.trim() ?? "";
  const memoryStateContext = input.memoryStateBlock?.trim() ?? "";
  const relevantFragments = input.relevantFragmentsBlock?.trim() ?? "";
  const continuityFeeling = input.continuityFeelingBlock?.trim() ?? "";
  const webContext = input.webContextBlock?.trim() ?? "";

  const prefixParts: string[] = [];
  if (identityPrompt) {
    prefixParts.push(identityPrompt);
  }
  const workspaceName = input.workspaceName.trim();
  if (workspaceName) {
    prefixParts.push(`Project: ${workspaceName}`);
  }
  if (awarenessContext) {
    prefixParts.push(awarenessContext);
  }
  if (aiLifeAwareness && aiLifeAwareness !== awarenessContext) {
    prefixParts.push(
      "AI Life awareness (relevant goals and projects only â€” do not cite unless clearly related):\n" +
        aiLifeAwareness,
    );
  }
  if (continuityIntelligence && continuityIntelligence !== awarenessContext) {
    prefixParts.push(
      "Continuity intelligence (relevant decisions and open questions only):\n" + continuityIntelligence,
    );
  }
  if (boundedSummary) {
    prefixParts.push(
      "Continuity summary (user-maintained project context â€” does not replace message history):\n" +
        boundedSummary,
    );
  }
  if (importedContext) {
    prefixParts.push(
      "Latest imported AI chat state (user-provided context imported into ContinuityOS):\n" +
        importedContext,
    );
  }
  if (memoryStateContext) {
    prefixParts.push(
      "Derived continuity memory state (supporting context only â€” conversation history is truth; memory may be wrong and is rebuildable):\n" +
        memoryStateContext,
    );
  }
  if (relevantFragments) {
    prefixParts.push(
      "Relevant derived memory fragments (support only â€” do not cite as memory unless user asks; conversation truth wins on conflict):\n" +
        relevantFragments,
    );
  }
  if (continuityFeeling) {
    prefixParts.push(
      "Continuity feeling preservation hints (keep conversation identity stable without announcing memory â€” do not say you remembered):\n" +
        continuityFeeling,
    );
  }
  if (webContext) {
    prefixParts.push(webContext);
  }

  if (prefixParts.length === 0) {
    return assembleThreadContext(input.messages, { maxMessages: input.maxMessages });
  }

  const providerMessages: ProviderMessage[] = [
    { role: "system", content: prefixParts.join("\n\n") },
    ...threadMessages,
  ];
  return {
    messages: providerMessages,
    estimatedTokens: estimateTokensPlaceholder(providerMessages),
  };
}

/** Rough token estimate (~4 chars/token) â€” replace with tiktoken later. */
export function estimateTokensPlaceholder(messages: ProviderMessage[]): number {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(chars / 4);
}

/**
 * Future truncation hook â€” currently returns messages unchanged.
 */
export function applyContextTruncation(
  messages: ProviderMessage[],
  _maxTokens: number,
): ProviderMessage[] {
  return messages;
}


