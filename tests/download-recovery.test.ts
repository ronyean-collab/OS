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
  restartEmbeddedLocalAiDownload,
  resumeEmbeddedLocalAiDownload,
} from "../electron/main/services/embedded-local-ai-manager";
import { DEFAULT_LOCAL_MODEL } from "../src/shared/default-ai-config";
import { __setLocalAiStatusDelegateForTests } from "../electron/main/services/local-ai-service";

describe("download recovery", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  beforeEach(() => {
    __setLocalAiStatusDelegateForTests(async () => ({
      state: "ollama_ready",
      message: "Local AI runtime detected.",
      detected: true,
      baseUrl: "http://127.0.0.1:9",
      models: [],
      selectedModel: DEFAULT_LOCAL_MODEL,
    }));
  });
  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("supports pause, resume, and restart after interrupted download", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-recover-"));
    let pullCount = 0;
    let modelInstalled = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({
              models: modelInstalled ? [{ name: DEFAULT_LOCAL_MODEL }] : [],
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/api/pull")) {
          pullCount += 1;
          if (pullCount === 1) {
            return new Response(
              JSON.stringify({ status: "downloading", total: 100, completed: 10 }) + "\n",
              { status: 200 },
            );
          }
          modelInstalled = true;
          return new Response(
            [JSON.stringify({ status: "downloading", total: 100, completed: 100 }), JSON.stringify({ status: "success" })].join("\n") + "\n",
            { status: 200 },
          );
        }
        throw new Error(`Unexpected ${url}`);
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Recovery");

    await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    const paused = pauseEmbeddedLocalAiDownload(userDataDir);
    expect(paused.paused).toBe(true);
    expect(paused.phase).toBe("paused");

    const resumed = resumeEmbeddedLocalAiDownload(userDataDir);
    expect(resumed.paused).toBe(false);

    const restarted = await restartEmbeddedLocalAiDownload(db, ws.id, userDataDir);
    expect(restarted.aiRepliesReady).toBe(true);
    expect(pullCount).toBeGreaterThanOrEqual(2);
  });

  it("treats local runtime pull failure as a runtime failure, not internet offline", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-offline-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith("/api/tags")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        throw new Error("fetch failed ECONNREFUSED");
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Offline");

    const status = await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    expect(status.phase).toBe("failed");
    expect(status.offline).toBe(false);
    expect(status.canChat).toBe(false);
  });
});
