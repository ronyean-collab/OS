import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateEmbeddedLocalResponse,
  getEmbeddedLocalLlmStatus,
  listEmbeddedLocalModelProfiles,
} from "../electron/main/services/embedded-local-llm-service";

describe("embedded local LLM scaffold", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    delete process.env.CONTINUITY_MODEL_DIR;
    while (cleanupPaths.length > 0) {
      const target = cleanupPaths.pop();
      if (target) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
  });

  it("returns a safe model-missing status with no installed files", async () => {
    const modelDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-models-"));
    cleanupPaths.push(modelDir);
    process.env.CONTINUITY_MODEL_DIR = modelDir;

    const status = getEmbeddedLocalLlmStatus();
    const generate = await generateEmbeddedLocalResponse();

    expect(status.state).toBe("model_missing");
    expect(status.installedModelCount).toBe(0);
    expect(status.availableForDirectChat).toBe(false);
    expect(status.modelDirectory).toBe(modelDir);
    expect(generate.status).toBe("MODEL_MISSING");
    expect(generate.ok).toBe(false);
  });

  it("exposes model metadata without downloading anything", () => {
    const modelDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-models-"));
    cleanupPaths.push(modelDir);
    process.env.CONTINUITY_MODEL_DIR = modelDir;

    const profiles = listEmbeddedLocalModelProfiles();

    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((profile) => profile.localPath.startsWith(modelDir))).toBe(true);
    expect(profiles.every((profile) => profile.installed === false)).toBe(true);
  });

  it("reports model-available but not-ready when a local file exists", async () => {
    const modelDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-models-"));
    cleanupPaths.push(modelDir);
    process.env.CONTINUITY_MODEL_DIR = modelDir;

    const [firstProfile] = listEmbeddedLocalModelProfiles();
    fs.writeFileSync(firstProfile.localPath, "placeholder");

    const status = getEmbeddedLocalLlmStatus();
    const generate = await generateEmbeddedLocalResponse();

    expect(status.state).toBe("model_available");
    expect(status.installedModelCount).toBe(1);
    expect(status.selectedModelId).toBe(firstProfile.id);
    expect(generate.status).toBe("NOT_READY");
    expect(generate.ok).toBe(false);
  });
});
