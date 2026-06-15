type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
};

function readEnvValue(key: string): string | boolean | undefined {
  const viteEnv = (import.meta as ImportMetaWithEnv).env?.[key];
  if (viteEnv !== undefined) return viteEnv;

  // Renderer/browser builds do not always expose Node's process object.
  // Guard it so shared code can safely run in both Electron main and renderer.
  const maybeProcess = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return maybeProcess.process?.env?.[key];
}

function isExplicitlyDisabled(value: string | boolean | undefined): boolean {
  return value === false || value === "false" || value === "0";
}

/**
 * Polaris consumer builds default to local-only chat.
 * Cloud/hosted provider code may exist for future/enterprise builds, but it must not be
 * user-facing or selected at runtime unless explicitly enabled by configuration.
 */
export const OLLAMA_ONLY_MODE = !isExplicitlyDisabled(readEnvValue("VITE_OLLAMA_ONLY_MODE"));

export function isOllamaOnlyChatMode(): boolean {
  return OLLAMA_ONLY_MODE;
}

