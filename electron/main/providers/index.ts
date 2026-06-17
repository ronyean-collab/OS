import { ollamaAdapter } from "./ollama-adapter";
import type { ProviderAdapter } from "./types";

const adapters: Record<string, ProviderAdapter> = {
  ollama: ollamaAdapter,
};

export function getProviderAdapter(providerId: string): ProviderAdapter | null {
  return adapters[providerId] ?? null;
}

export function listProviderAdapters(): ProviderAdapter[] {
  return Object.values(adapters);
}