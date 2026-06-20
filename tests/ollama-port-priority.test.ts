import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetRuntimeProvisionerForTests,
  __setRuntimeProvisionerDelegateForTests,
  discoverReachableOllamaBaseUrl,
  provisionLocalRuntime,
} from "../electron/main/services/local-runtime-provisioner";
import { OLLAMA_DEFAULT_BASE_URLS, OLLAMA_MANAGED_BASE_URL } from "../src/shared/ollama-endpoints";

describe("ollama port priority", () => {
  afterEach(() => {
    __resetRuntimeProvisionerForTests();
    vi.unstubAllGlobals();
  });

  it("prefers default port 11434 when reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes(":11434")) {
          return new Response(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }), {
            status: 200,
          });
        }
        throw new Error("ECONNREFUSED");
      }),
    );

    const found = await discoverReachableOllamaBaseUrl();
    expect(found).toBe(OLLAMA_DEFAULT_BASE_URLS[0]);

    const result = await provisionLocalRuntime("/tmp/continuity-ollama-priority");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.baseUrl).toContain("11434");
      expect(result.baseUrl).not.toBe(OLLAMA_MANAGED_BASE_URL);
    }
  });
});
