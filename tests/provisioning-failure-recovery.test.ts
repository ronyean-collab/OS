import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __resetEmbeddedLocalAiManagerForTests,
  pauseEmbeddedLocalAiDownload,
  prepareEmbeddedLocalAiOnFirstRun,
  resumeEmbeddedLocalAiDownload,
} from "../electron/main/services/embedded-local-ai-manager";
import { __setRuntimeProvisionerDelegateForTests } from "../electron/main/services/local-runtime-provisioner";
import { DEFAULT_LOCAL_MODEL } from "../src/shared/default-ai-config";
import { __setLocalAiStatusDelegateForTests } from "../electron/main/services/local-ai-service";

describe("provisioning failure recovery", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  beforeEach(() => {
    __setLocalAiStatusDelegateForTests(async () => ({
      state: "ollama_not_running",
      message: "Local AI is unavailable.",
      detected: false,
      baseUrl: "http://127.0.0.1:9",
      models: [],
      selectedModel: null,
    }));
  });
  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    __setRuntimeProvisionerDelegateForTests(null);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("enters offline_waiting when runtime install cannot reach the internet", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-recovery-"));
    __setRuntimeProvisionerDelegateForTests(async () => ({
      ok: false,
      error: "fetch failed: network offline",
      offline: true,
    }));

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Recovery");

    const status = await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    expect(status.phase).toBe("offline_waiting");
    expect(status.offline).toBe(true);
    expect(status.aiRepliesReady).toBe(false);
  });

  it("supports pause and resume without dead-end state", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-pause-"));
    const baseUrl = "http://127.0.0.1:11435";
    __setRuntimeProvisionerDelegateForTests(async () => ({ ok: true, baseUrl }));
    __setLocalAiStatusDelegateForTests(async (_db, _workspaceId, preferredBaseUrl) => ({
      state: preferredBaseUrl ? "ollama_ready" : "ollama_not_running",
      message: preferredBaseUrl
        ? "Local AI runtime detected."
        : "Local AI is unavailable.",
      detected: Boolean(preferredBaseUrl),
      baseUrl: preferredBaseUrl ?? "http://127.0.0.1:9",
      models: [],
      selectedModel: DEFAULT_LOCAL_MODEL,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ models: [{ name: DEFAULT_LOCAL_MODEL }] }), {
          status: 200,
        });
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Pause");

    await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    const paused = pauseEmbeddedLocalAiDownload(userDataDir);
    expect(paused.paused).toBe(true);
    const resumed = resumeEmbeddedLocalAiDownload(userDataDir);
    expect(resumed.paused).toBe(false);
    expect(resumed.phase).toBe("downloading");
  });
});
