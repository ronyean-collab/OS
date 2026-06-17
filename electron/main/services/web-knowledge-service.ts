import type Database from "better-sqlite3";
import { getAssistantProfile } from "./assistant-profile-service";

export type WebSearchResult = {
  query: string;
  summary: string;
  checkedAt: string;
  source: "stub" | "live";
};

/** Whether web access is enabled in assistant profile (policy gate). */
export function canUseWeb(db: Database.Database): boolean {
  const profile = getAssistantProfile(db);
  return profile.webEnabled;
}

/**
 * Live web search is not implemented in this build.
 * Returns null — callers must not treat this as successful search.
 */
export async function searchCurrentInfo(
  _db: Database.Database,
  _query: string,
): Promise<WebSearchResult | null> {
  return null;
}

export function summarizeWebResult(result: WebSearchResult): string {
  return result.summary.trim();
}

/**
 * Optional context block for provider assembly when live search exists.
 * Returns null when search is unavailable (default).
 */
export async function buildWebContextBlock(
  db: Database.Database,
  query: string,
): Promise<string | null> {
  if (!canUseWeb(db)) {
    return null;
  }
  const result = await searchCurrentInfo(db, query);
  if (!result) {
    return null;
  }
  return (
    "Current web information (briefly note to the user that current information was checked):\n" +
    summarizeWebResult(result)
  );
}

export function webUnavailableUserGuidance(): string {
  return "Current information may be needed, but live web search is not available in this build yet.";
}
