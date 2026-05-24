/** @deprecated Import from provider-definitions.ts */
export {
  getProviderDefinition,
  listProviderDefinitions,
  type ProviderDefinition,
  type ProviderModelOption,
} from "./provider-definitions";

import { getProviderDefinition } from "./provider-definitions";

export const DEFAULT_OPENAI_MODEL = getProviderDefinition("openai").recommendedModel;

export const OPENAI_API_KEYS_URL =
  getProviderDefinition("openai").apiKeyUrl ?? "https://platform.openai.com/api-keys";

export const OPENAI_MODEL_OPTIONS = getProviderDefinition("openai").modelOptions;
