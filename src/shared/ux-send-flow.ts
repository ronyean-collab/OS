/** Pure send-routing when Ollama is not ready (manual-first UX). */

export type ManualSendWhenOfflineResult =
  | { action: "stream" }
  | { action: "manual_save"; openWorkflow: "continue_any_ai" };

export function resolveSendWhenProviderOffline(providerReady: boolean): ManualSendWhenOfflineResult {
  if (providerReady) return { action: "stream" };
  return { action: "manual_save", openWorkflow: "continue_any_ai" };
}
