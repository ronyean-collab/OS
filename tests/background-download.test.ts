import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __resetEmbeddedLocalAiManagerForTests,
  getInstallProgress,
  prepareEmbeddedLocalAiOnFirstRun,
} from "../electron/main/services/embedded-local-ai-manager";
import { DEFAULT_LOCAL_MODEL } from "../src/shared/default-ai-config";

describe("background AI download", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("starts download automatically when local runtime exists without default model", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-dl-"));
    const baseUrl = "http://127.0.0.1:11434";
    let modelInstalled = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({
              models: [{ name: modelInstalled ? DEFAULT_LOCAL_MODEL : "other:7b" }],
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/api/pull") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { name: string };
          expect(body.name).toBe(DEFAULT_LOCAL_MODEL);
          modelInstalled = true;
          return new Response(
            [
              JSON.stringify({ status: "pulling manifest" }),
              JSON.stringify({ status: "downloading", total: 100, completed: 50 }),
              JSON.stringify({ status: "success" }),
            ].join("\n") + "\n",
            { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
          );
        }
        throw new Error(`Unexpected fetch ${url}`);
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Download test");

    const status = await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    expect(status.aiRepliesReady).toBe(true);
    const progress = getInstallProgress();
    expect(progress?.phase).toBe("ready");
    expect(status.message.toLowerCase()).not.toContain("ollama");
  });
});
