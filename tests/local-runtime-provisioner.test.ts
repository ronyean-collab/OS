import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetRuntimeProvisionerForTests,
  __setRuntimeProvisionerDelegateForTests,
  MANAGED_OLLAMA_BASE_URL,
  provisionLocalRuntime,
} from "../electron/main/services/local-runtime-provisioner";

describe("local runtime provisioner", () => {
  let userDataDir = "";

  afterEach(() => {
    __resetRuntimeProvisionerForTests();
    vi.unstubAllEnvs();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it("uses test stub to simulate ready runtime", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-runtime-"));
    vi.stubEnv("CONTINUITY_RUNTIME_PROVISION_STUB", "ready");
    const result = await provisionLocalRuntime(userDataDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.baseUrl).toBeTruthy();
    }
  });

  it("returns offline when stub requests offline", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-runtime-"));
    vi.stubEnv("CONTINUITY_RUNTIME_PROVISION_STUB", "offline");
    const result = await provisionLocalRuntime(userDataDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.offline).toBe(true);
    }
  });

  it("supports delegate injection for tests", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-runtime-"));
    __setRuntimeProvisionerDelegateForTests(async () => ({
      ok: true,
      baseUrl: "http://127.0.0.1:11555",
    }));
    const result = await provisionLocalRuntime(userDataDir);
    expect(result).toEqual({ ok: true, baseUrl: "http://127.0.0.1:11555" });
  });
});
