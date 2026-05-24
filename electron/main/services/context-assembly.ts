import type { Message } from "../../../src/shared/types";
import type { ProviderMessage } from "../providers/types";

/** Default recent window — truncation hook for Phase 3+. */
export const DEFAULT_CONTEXT_MESSAGE_LIMIT = 40;

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
