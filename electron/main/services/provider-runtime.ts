import { getProviderDefinition } from "../../../src/shared/provider-definitions";
import { getProviderAdapter } from "../providers";

/** True when this provider has a working chat adapter in the current build. */
export function isProviderRuntimeReady(providerId: string): boolean {
  const def = getProviderDefinition(providerId);
  if (!def.activeChatEngine || def.status !== "ready") {
    return false;
  }
  return getProviderAdapter(providerId) != null;
}

export function providerRuntimeMessage(providerId: string): string {
  const def = getProviderDefinition(providerId);
  if (!def.activeChatEngine) {
    return `${def.displayName} is not enabled for in-app chat in this build.`;
  }
  if (def.status === "ready" && !getProviderAdapter(providerId)) {
    return `${def.displayName} adapter is not available in this build.`;
  }
  if (def.status === "setup_only" || def.status === "coming_soon") {
    return `${def.displayName} setup can be saved, but in-app chat is not available yet.`;
  }
  return `${def.displayName} is not ready for assistant replies. Open Providers to configure and test the connection.`;
}
