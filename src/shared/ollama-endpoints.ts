/** Ollama URL priority — default user port first, managed ContinuityOS port second. */

export const OLLAMA_DEFAULT_PORT = 11434;
export const OLLAMA_MANAGED_PORT = 11435;

export const OLLAMA_DEFAULT_BASE_URLS = [
  `http://127.0.0.1:${OLLAMA_DEFAULT_PORT}`,
  `http://localhost:${OLLAMA_DEFAULT_PORT}`,
] as const;

export const OLLAMA_MANAGED_BASE_URL = `http://127.0.0.1:${OLLAMA_MANAGED_PORT}`;

export const OLLAMA_PROBE_URLS = [
  ...OLLAMA_DEFAULT_BASE_URLS,
  OLLAMA_MANAGED_BASE_URL,
] as const;

/** Legacy dev/test ports still used when OLLAMA_HOST points off defaults. */
export const OLLAMA_LEGACY_FALLBACK_URLS = [
  "http://127.0.0.1:11500",
  "http://localhost:11500",
] as const;

export function normalizeOllamaBaseUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Probe order: custom OLLAMA_HOST → 11434 → 11435 → legacy 11500. */
export function buildOllamaProbeUrls(): string[] {
  const envHost = normalizeOllamaBaseUrl(process.env.OLLAMA_HOST);
  const e2eHostOnly = process.env.CONTINUITY_E2E_OLLAMA_HOST_ONLY === "1";

  if (e2eHostOnly && envHost) {
    return [envHost];
  }

  const list: string[] = [];
  if (envHost) {
    list.push(envHost);
  }
  for (const baseUrl of OLLAMA_DEFAULT_BASE_URLS) {
    if (!list.includes(baseUrl)) {
      list.push(baseUrl);
    }
  }
  if (!list.includes(OLLAMA_MANAGED_BASE_URL)) {
    list.push(OLLAMA_MANAGED_BASE_URL);
  }
  for (const legacy of OLLAMA_LEGACY_FALLBACK_URLS) {
    if (!list.includes(legacy)) {
      list.push(legacy);
    }
  }
  return [...new Set(list)];
}
