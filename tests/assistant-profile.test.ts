import { describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  DEFAULT_ASSISTANT_NAME,
  ensureAssistantProfile,
  getAssistantProfile,
  updateAssistantProfile,
} from "../electron/main/services/assistant-profile-service";
import { getAppliedVersion } from "../electron/main/database/migrations";
import { SCHEMA_VERSION } from "../electron/main/database/schema";

describe("assistant profile service", () => {
  it("creates default profile on fresh database", () => {
    const { db, cleanup } = openTestDatabase();
    const profile = ensureAssistantProfile(db);
    expect(profile.assistantName).toBe(DEFAULT_ASSISTANT_NAME);
    expect(profile.webEnabled).toBe(true);
    expect(profile.memoryEnabled).toBe(true);
    expect(profile.continuityEnabled).toBe(true);
    expect(profile.preferredTone).toBe("friendly");
    cleanup();
  });

  it("persists assistant name updates", () => {
    const { db, cleanup } = openTestDatabase();
    ensureAssistantProfile(db);
    const updated = updateAssistantProfile(db, { assistantName: "Nova" });
    expect(updated.assistantName).toBe("Nova");
    expect(getAssistantProfile(db).assistantName).toBe("Nova");
    cleanup();
  });

  it("falls back to Assistant for blank names", () => {
    const { db, cleanup } = openTestDatabase();
    ensureAssistantProfile(db);
    const updated = updateAssistantProfile(db, { assistantName: "   " });
    expect(updated.assistantName).toBe(DEFAULT_ASSISTANT_NAME);
    cleanup();
  });

  it("updates webEnabled default true and toggles off", () => {
    const { db, cleanup } = openTestDatabase();
    const profile = ensureAssistantProfile(db);
    expect(profile.webEnabled).toBe(true);
    const off = updateAssistantProfile(db, { webEnabled: false });
    expect(off.webEnabled).toBe(false);
    cleanup();
  });

  it("migration 14 creates assistant_profile table", () => {
    const { db, cleanup } = openTestDatabase();
    expect(getAppliedVersion(db)).toBeGreaterThanOrEqual(14);
    expect(SCHEMA_VERSION).toBe(16);
    const row = db
      .prepare("SELECT assistant_name FROM assistant_profile WHERE id = 'default'")
      .get() as { assistant_name: string };
    expect(row.assistant_name).toBe(DEFAULT_ASSISTANT_NAME);
    cleanup();
  });
});
