/** Canonical consumer-facing AI status copy — never undefined in UI. */

import type { UnifiedAssistantStatus } from "./assistant-preparation-service";
import { AI_STATUS_PREPARING } from "./ai-readiness";
import type { AppState, EmbeddedAiConsumerStatus } from "./types";

export const DEFAULT_CONSUMER_STATUS_MESSAGE = "Preparing your assistant…";

export function resolveConsumerStatusMessage(input: {
  explicitMessage?: string | null;
  unified?: UnifiedAssistantStatus | null;
  appState?: AppState | null;
  embedded?: EmbeddedAiConsumerStatus | null;
  provisioningConsumerMessage?: string | null;
}): string {
  const fromExplicit = input.explicitMessage?.trim();
  if (fromExplicit) return fromExplicit;

  const fromProvisioning = input.provisioningConsumerMessage?.trim();
  if (fromProvisioning) return fromProvisioning;

  const fromUnified =
    input.unified?.headerMessage?.trim() ||
    input.unified?.bannerMessage?.trim() ||
    null;
  if (fromUnified) return fromUnified;

  const fromApp = input.appState?.defaultAiConsumerMessage?.trim();
  if (fromApp) return fromApp;

  const fromEmbedded = input.embedded?.message?.trim();
  if (fromEmbedded) return fromEmbedded;

  return DEFAULT_CONSUMER_STATUS_MESSAGE || AI_STATUS_PREPARING;
}
