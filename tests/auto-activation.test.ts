import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { getProviderConfig } from "../electron/main/services/provider-service";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  __resetEmbeddedLocalAiManagerForTests,
  checkLocalAiReady,
  prepareEmbeddedLocalAiOnFirstRun,
} from "../electron/main/services/embedded-local-ai-manager";
import { resolveDefaultAiRoute } from "../electron/main/services/default-ai-runtime";
import { DEFAULT_LOCAL_MODEL } from "../src/shared/default-ai-config";

describe("auto activation", () => {
  const cleanups: Array<() => void> = [];
  let userDataDir = "";

  afterEach(() => {
    __resetEmbeddedLocalAiManagerForTests();
    vi.unstubAllGlobals();
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    while (cleanups.length) cleanups.pop()?.();
  });

  it("activates AI automatically when default model is already installed", async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-auto-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith("/api/tags")) {
          return new Response(
            JSON.stringify({ models: [{ name: DEFAULT_LOCAL_MODEL }] }),
            { status: 200 },
          );
        }
        if (String(input).includes("/api/chat") || String(input).includes("test")) {
          return new Response(JSON.stringify({ message: { content: "pong" } }), { status: 200 });
        }
        return new Response(JSON.stringify({ models: [{ name: DEFAULT_LOCAL_MODEL }] }), {
          status: 200,
        });
      }),
    );

    const { db, cleanup } = openTestDatabase();
    cleanups.push(cleanup);
    const ws = createWorkspace(db, "Auto activate");

    const status = await prepareEmbeddedLocalAiOnFirstRun(db, ws.id, userDataDir);
    expect(status.aiRepliesReady).toBe(true);

    const config = getProviderConfig(db, ws.id);
    expect(config?.enabled).toBe(true);
    expect(config?.provider).toBe("ollama");

    const { ready } = await checkLocalAiReady(db, ws.id);
    expect(ready).toBe(true);

    const route = await resolveDefaultAiRoute(db, ws.id);
    expect(route.canReply).toBe(true);
    expect(route.providerReady).toBe(true);
    expect(route.status).toBe("ready");
  });
});
