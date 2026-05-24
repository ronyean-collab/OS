import type { ProviderAdapter } from "./types";
import { openAIAdapter } from "./openai-adapter";

const adapters: Record<string, ProviderAdapter> = {
  openai: openAIAdapter,
};

export function registerProviderAdapter(id: string, adapter: ProviderAdapter): void {
  adapters[id] = adapter;
}

export function resetProviderAdapters(): void {
  adapters.openai = openAIAdapter;
  delete adapters.mock;
}

export function getProviderAdapter(providerId: string): ProviderAdapter | null {
  return adapters[providerId] ?? null;
}

export function listProviderIds(): string[] {
  return Object.keys(adapters);
}
