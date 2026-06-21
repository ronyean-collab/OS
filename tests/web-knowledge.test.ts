import { describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  buildWebContextBlock,
  canUseWeb,
  searchCurrentInfo,
  webUnavailableUserGuidance,
} from "../electron/main/services/web-knowledge-service";
import { ensureAssistantProfile } from "../electron/main/services/assistant-profile-service";

describe("web knowledge service", () => {
  it("defaults webEnabled to true", () => {
    const { db, cleanup } = openTestDatabase();
    const profile = ensureAssistantProfile(db);
    expect(profile.webEnabled).toBe(true);
    expect(canUseWeb(db)).toBe(true);
    cleanup();
  });

  it("does not fake web search results", async () => {
    const { db, cleanup } = openTestDatabase();
    ensureAssistantProfile(db);
    const result = await searchCurrentInfo(db, "latest news");
    expect(result).toBeNull();
    const block = await buildWebContextBlock(db, "latest news");
    expect(block).toBeNull();
    cleanup();
  });

  it("provides calm unavailable guidance", () => {
    expect(webUnavailableUserGuidance()).toContain("not available");
  });
});
