import { describe, expect, it } from "vitest";
import {
  PROVIDER_SECURE_STORAGE_ERROR,
  formatProviderSaveError,
} from "../src/shared/provider-errors";

describe("provider renderer errors", () => {
  it("displays safe secure storage error without stack or key", () => {
    const err = new Error(PROVIDER_SECURE_STORAGE_ERROR);
    const message = formatProviderSaveError(err);
    expect(message).toBe(PROVIDER_SECURE_STORAGE_ERROR);
    expect(message).not.toMatch(/sk-/);
    expect(message).not.toMatch(/at /);
  });

  it("maps legacy secure storage IPC message", () => {
    const message = formatProviderSaveError(
      new Error("API key could not be stored in secure storage."),
    );
    expect(message).toBe(PROVIDER_SECURE_STORAGE_ERROR);
  });
});
