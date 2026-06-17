import type Database from "better-sqlite3";
import type { AssistantProfile, AssistantProfileUpdate } from "../../../src/shared/types";
import { ASSISTANT_IDENTITY_PROMPT_VERSION } from "./assistant-identity-service";

export const DEFAULT_ASSISTANT_NAME = "Assistant";
export const ASSISTANT_PROFILE_ROW_ID = "default";

type AssistantProfileRow = {
  id: string;
  assistant_name: string;
  assistant_created_at: string;
  assistant_identity_version: number;
  preferred_tone: string;
  web_enabled: number;
  memory_enabled: number;
  continuity_enabled: number;
  updated_at: string;
};

function mapRow(row: AssistantProfileRow): AssistantProfile {
  return {
    assistantName: row.assistant_name,
    assistantCreatedAt: row.assistant_created_at,
    assistantIdentityVersion: row.assistant_identity_version,
    preferredTone: "friendly",
    webEnabled: row.web_enabled === 1,
    memoryEnabled: row.memory_enabled === 1,
    continuityEnabled: row.continuity_enabled === 1,
    updatedAt: row.updated_at,
  };
}

export function ensureAssistantProfile(db: Database.Database): AssistantProfile {
  const existing = db
    .prepare("SELECT * FROM assistant_profile WHERE id = ?")
    .get(ASSISTANT_PROFILE_ROW_ID) as AssistantProfileRow | undefined;
  if (existing) {
    return mapRow(existing);
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO assistant_profile (
      id, assistant_name, assistant_created_at, assistant_identity_version,
      preferred_tone, web_enabled, memory_enabled, continuity_enabled, updated_at
    ) VALUES (?, ?, ?, ?, 'friendly', 1, 1, 1, ?)`,
  ).run(
    ASSISTANT_PROFILE_ROW_ID,
    DEFAULT_ASSISTANT_NAME,
    now,
    ASSISTANT_IDENTITY_PROMPT_VERSION,
    now,
  );

  return getAssistantProfile(db);
}

export function getAssistantProfile(db: Database.Database): AssistantProfile {
  const row = db
    .prepare("SELECT * FROM assistant_profile WHERE id = ?")
    .get(ASSISTANT_PROFILE_ROW_ID) as AssistantProfileRow | undefined;
  if (!row) {
    return ensureAssistantProfile(db);
  }
  return mapRow(row);
}

export function updateAssistantProfile(
  db: Database.Database,
  patch: AssistantProfileUpdate,
): AssistantProfile {
  ensureAssistantProfile(db);
  const current = getAssistantProfile(db);
  const now = new Date().toISOString();

  let name = current.assistantName;
  if (patch.assistantName !== undefined) {
    const trimmed = patch.assistantName.trim();
    name = trimmed.length > 0 ? trimmed.slice(0, 64) : DEFAULT_ASSISTANT_NAME;
  }

  const webEnabled = patch.webEnabled ?? current.webEnabled;
  const memoryEnabled = patch.memoryEnabled ?? current.memoryEnabled;
  const continuityEnabled = patch.continuityEnabled ?? current.continuityEnabled;

  db.prepare(
    `UPDATE assistant_profile SET
      assistant_name = ?,
      web_enabled = ?,
      memory_enabled = ?,
      continuity_enabled = ?,
      assistant_identity_version = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(
    name,
    webEnabled ? 1 : 0,
    memoryEnabled ? 1 : 0,
    continuityEnabled ? 1 : 0,
    ASSISTANT_IDENTITY_PROMPT_VERSION,
    now,
    ASSISTANT_PROFILE_ROW_ID,
  );

  return getAssistantProfile(db);
}
