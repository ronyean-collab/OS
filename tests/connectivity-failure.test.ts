import { describe, expect, it } from "vitest";
import {
  classifyConnectivityFailure,
  isExternalNetworkOffline,
  isLocalRuntimeUnreachable,
} from "../src/shared/connectivity-failure";

describe("connectivity failure classification", () => {
  it("treats localhost ECONNREFUSED as local runtime, not internet offline", () => {
    const error = new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:11435");
    expect(classifyConnectivityFailure(error, { targetUrl: "http://127.0.0.1:11435" })).toBe(
      "local_runtime",
    );
    expect(isExternalNetworkOffline(error, { targetUrl: "http://127.0.0.1:11435" })).toBe(false);
    expect(isLocalRuntimeUnreachable(error, { targetUrl: "http://127.0.0.1:11435" })).toBe(true);
  });

  it("treats ollama.com download failures as external offline", () => {
    const error = new Error("fetch failed: network offline");
    expect(
      isExternalNetworkOffline(error, {
        targetUrl: "https://ollama.com/download/OllamaSetup.exe",
      }),
    ).toBe(true);
  });

  it("does not mark generic fetch to local pull as external offline", () => {
    const error = new Error("fetch failed");
    expect(isExternalNetworkOffline(error, { targetUrl: "http://127.0.0.1:11435/api/pull" })).toBe(
      false,
    );
  });
});
