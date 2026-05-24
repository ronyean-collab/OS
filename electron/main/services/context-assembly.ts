import type { Message } from "../../../src/shared/types";
import type { ProviderMessage } from "../providers/types";

/** Default recent window — truncation hook for Phase 3+. */
export const DEFAULT_CONTEXT_MESSAGE_LIMIT = 40;

/** Max chars stored/sent for user-editable continuity summary. */
export const MAX_CONTINUITY_SUMMARY_CHARS = 8000;

/**
 * Deterministic recent-message context for provider requests.
 * No semantic retrieval — chronological tail of thread only.
 */
export function assembleThreadContext(
  messages: Message[],
  options?: { maxMessages?: number },
): { messages: ProviderMessage[]; estimatedTokens: number } {
  const limit = options?.maxMessages ?? DEFAULT_CONTEXT_MESSAGE_LIMIT;
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const recent = sorted.slice(-limit);
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
  continuitySummary?: string | null;
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
  const boundedSummary =
    rawSummary.length > MAX_CONTINUITY_SUMMARY_CHARS
      ? rawSummary.slice(0, MAX_CONTINUITY_SUMMARY_CHARS)
      : rawSummary;

  const prefixParts: string[] = [];
  const workspaceName = input.workspaceName.trim();
  if (workspaceName) {
    prefixParts.push(`Project: ${workspaceName}`);
  }
  if (boundedSummary) {
    prefixParts.push(
      "Continuity summary (user-maintained project context — does not replace message history):\n" +
        boundedSummary,
    );
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

/** Rough token estimate (~4 chars/token) — replace with tiktoken later. */
export function estimateTokensPlaceholder(messages: ProviderMessage[]): number {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(chars / 4);
}

/**
 * Future truncation hook — currently returns messages unchanged.
 */
export function applyContextTruncation(
  messages: ProviderMessage[],
  _maxTokens: number,
): ProviderMessage[] {
  return messages;
}
