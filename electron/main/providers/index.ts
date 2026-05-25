import type { ProviderAdapter } from "./types";
import { openAIAdapter } from "./openai-adapter";
import { ollamaAdapter } from "./ollama-adapter";

const adapters: Record<string, ProviderAdapter> = {
  openai: openAIAdapter,
  ollama: ollamaAdapter,
};

export function registerProviderAdapter(id: string, adapter: ProviderAdapter): void {
  adapters[id] = adapter;
}

export function resetProviderAdapters(): void {
  adapters.openai = openAIAdapter;
  adapters.ollama = ollamaAdapter;
  delete adapters.mock;
}

export function getProviderAdapter(providerId: string): ProviderAdapter | null {
  return adapters[providerId] ?? null;
}

export function listProviderIds(): string[] {
  return Object.keys(adapters);
}
