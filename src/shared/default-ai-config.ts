/** App-level hosted fallback — secrets via secure storage ref only. */

export type DefaultAiRouteStatus =
  | "ready"
  | "preparing"
  | "downloading"
  | "starting"
  | "unavailable"
  | "needs_provider"
  | "manual_mode"
  | "needs_attention";

export type DefaultAiRouteSource = "local" | "user_provider" | "hosted_default" | "manual";

export type DefaultHostedAiConfig = {
  provider: string;
  model: string;
  baseUrl: string | null;
  keyRef: string;
};

export const DEFAULT_AI_ENV_KEYS = {
  provider: "DEFAULT_AI_PROVIDER",
  model: "DEFAULT_AI_MODEL",
  baseUrl: "DEFAULT_AI_BASE_URL",
  keyRef: "DEFAULT_AI_KEY_REF",
} as const;

export function loadDefaultHostedAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): DefaultHostedAiConfig | null {
  const provider = env[DEFAULT_AI_ENV_KEYS.provider]?.trim().toLowerCase();
  const model = env[DEFAULT_AI_ENV_KEYS.model]?.trim();
  const keyRef = env[DEFAULT_AI_ENV_KEYS.keyRef]?.trim();
  if (!provider || !model || !keyRef) {
    return null;
  }
  const baseUrl = env[DEFAULT_AI_ENV_KEYS.baseUrl]?.trim() || null;
  return { provider, model, baseUrl, keyRef };
}

export const DEFAULT_AI_ROUTE_LABEL = "ContinuityOS Default AI";

/** Default local AI model — single choice for first-run; no onboarding picker. */
export const DEFAULT_LOCAL_MODEL = "llama3.2:3b";

export const DEFAULT_LOCAL_MODEL_CANDIDATES = [
  "llama3.2:3b",
  "qwen2.5:3b",
  "gemma3:4b",
] as const;

export function resolveDefaultLocalModel(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.DEFAULT_LOCAL_MODEL?.trim();
  if (override) return override;
  return DEFAULT_LOCAL_MODEL;
}
