/** User-facing message when OS secure storage cannot persist an API key. */
export const PROVIDER_SECURE_STORAGE_ERROR =
  "API key could not be stored securely. Please check system secure storage permissions.";

/** Map IPC/main errors to safe renderer copy (never includes secret values). */
export function formatProviderSaveError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (
      msg.includes(PROVIDER_SECURE_STORAGE_ERROR) ||
      msg.toLowerCase().includes("secure storage")
    ) {
      return PROVIDER_SECURE_STORAGE_ERROR;
    }
    return msg;
  }
  return "Could not save provider configuration.";
}
