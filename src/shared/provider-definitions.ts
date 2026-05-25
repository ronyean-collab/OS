export type ProviderDefinitionStatus = "ready" | "setup_only" | "coming_soon";

export type ProviderModelOption = {
  id: string;
  label: string;
};

export type ProviderDefinition = {
  id: string;
  displayName: string;
  description: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  docsUrl: string | null;
  apiKeyUrl: string | null;
  recommendedModel: string;
  modelOptions: ProviderModelOption[];
  requiresApiKey: boolean;
  localOnly: boolean;
  defaultBaseUrl: string | null;
  requiresBaseUrl: boolean;
  setupSteps: string[];
  billingNote: string;
  privacyNote: string;
  status: ProviderDefinitionStatus;
};

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    description: "ChatGPT models via the official OpenAI API.",
    apiKeyLabel: "OpenAI API key",
    apiKeyPlaceholder: "sk-…",
    docsUrl: "https://platform.openai.com/docs",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    recommendedModel: "gpt-4.1-mini",
    modelOptions: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (recommended)" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
    requiresApiKey: true,
    localOnly: false,
    defaultBaseUrl: null,
    requiresBaseUrl: false,
    setupSteps: [
      "Create an API key in your OpenAI dashboard.",
      "Paste the key below (shown only once at creation).",
      "Run Test connection, then Save provider.",
    ],
    billingNote: "OpenAI bills usage on your account. Check pricing on openai.com.",
    privacyNote:
      "Your key is stored only in OS secure storage on this device — never in the SQLite database.",
    status: "ready",
  },
  {
    id: "anthropic",
    displayName: "Anthropic Claude",
    description: "Claude models for reasoning and long-context chat.",
    apiKeyLabel: "Anthropic API key",
    apiKeyPlaceholder: "sk-ant-…",
    docsUrl: "https://docs.anthropic.com",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    recommendedModel: "claude-3-5-haiku-latest",
    modelOptions: [
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (recommended)" },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-opus-latest", label: "Claude 3 Opus" },
    ],
    requiresApiKey: true,
    localOnly: false,
    defaultBaseUrl: null,
    requiresBaseUrl: false,
    setupSteps: [
      "Create an API key in the Anthropic Console.",
      "Paste the key below and save your preferred model.",
      "Assistant runtime for Claude is coming next in ContinuityOS.",
    ],
    billingNote: "Anthropic bills usage on your account.",
    privacyNote:
      "Keys stay in OS secure storage locally. ContinuityOS does not send keys to our servers.",
    status: "setup_only",
  },
  {
    id: "google",
    displayName: "Google Gemini",
    description: "Gemini models via Google AI Studio.",
    apiKeyLabel: "Gemini API key",
    apiKeyPlaceholder: "AIza…",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    recommendedModel: "gemini-1.5-flash",
    modelOptions: [
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash (recommended)" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    requiresApiKey: true,
    localOnly: false,
    defaultBaseUrl: null,
    requiresBaseUrl: false,
    setupSteps: [
      "Create an API key in Google AI Studio.",
      "Paste the key below and choose a model.",
      "Assistant runtime for Gemini is coming next in ContinuityOS.",
    ],
    billingNote: "Google may bill or rate-limit usage per your AI Studio plan.",
    privacyNote:
      "Keys are stored locally in OS secure storage, not in your continuity database.",
    status: "setup_only",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    description: "Route requests to many models through one API key.",
    apiKeyLabel: "OpenRouter API key",
    apiKeyPlaceholder: "sk-or-…",
    docsUrl: "https://openrouter.ai/docs",
    apiKeyUrl: "https://openrouter.ai/keys",
    recommendedModel: "openai/gpt-4o-mini",
    modelOptions: [
      { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini (via OpenRouter)" },
      { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (via OpenRouter)" },
      { id: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash (via OpenRouter)" },
    ],
    requiresApiKey: true,
    localOnly: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresBaseUrl: true,
    setupSteps: [
      "Create an API key at openrouter.ai/keys.",
      "Confirm the API base URL (default shown below).",
      "Paste your key and save — runtime routing is coming next.",
    ],
    billingNote: "OpenRouter bills per model usage on your OpenRouter account.",
    privacyNote:
      "Your key is kept in OS secure storage. Requests will go to OpenRouter when runtime is enabled.",
    status: "setup_only",
  },
  {
    id: "ollama",
    displayName: "Local Ollama",
    description: "Run open models locally with Ollama — no cloud API key required.",
    apiKeyLabel: "API key (not required)",
    apiKeyPlaceholder: "Not used for local Ollama",
    docsUrl: "https://github.com/ollama/ollama",
    apiKeyUrl: null,
    recommendedModel: "llama3.1",
    modelOptions: [
      { id: "llama3.1", label: "Llama 3.1 (pull with ollama pull llama3.1)" },
      { id: "llama3.2", label: "Llama 3.2" },
      { id: "mistral", label: "Mistral" },
    ],
    requiresApiKey: false,
    localOnly: true,
    defaultBaseUrl: "http://localhost:11434",
    requiresBaseUrl: true,
    setupSteps: [
      "Install Ollama from ollama.com and start the server.",
      "Pull a model: ollama pull llama3.1",
      "Set the base URL below (default http://localhost:11434), test connection, then use Local AI.",
    ],
    billingNote: "No API billing — compute runs on your machine.",
    privacyNote:
      "Messages stay on your device when Ollama runs locally. No API key is stored.",
    status: "ready",
  },
];

const byId = new Map(PROVIDER_DEFINITIONS.map((p) => [p.id, p]));

export function getProviderDefinition(providerId: string): ProviderDefinition {
  const id = providerId.trim().toLowerCase();
  const def = byId.get(id);
  if (!def) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return def;
}

export function listProviderDefinitions(): ProviderDefinition[] {
  return [...PROVIDER_DEFINITIONS];
}

export function providerStatusLabel(status: ProviderDefinitionStatus): string {
  switch (status) {
    case "ready":
      return "Ready for chat";
    case "setup_only":
      return "Setup only — runtime coming next";
    case "coming_soon":
      return "Coming soon";
    default:
      return status;
  }
}
