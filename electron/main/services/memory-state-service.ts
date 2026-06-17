import { performance } from "node:perf_hooks";
import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { MessageRole } from "../../../src/shared/types";

export type MemoryFragmentType =
  | "user_preference"
  | "project_goal"
  | "decision"
  | "open_loop"
  | "fact"
  | "instruction"
  | "context_summary";

export type ProfilePreferenceCategory =
  | "ux_preference"
  | "provider_preference"
  | "workflow_preference"
  | "continuity_preference"
  | "communication_preference";

type FragmentCategory =
  | "goal"
  | "open_loop"
  | "decision"
  | "profile_preference"
  | "operational_fact"
  | "instruction";

export type MemoryFragment = {
  id: string;
  workspaceId: string;
  threadId: string;
  sourceMessageId: string;
  fragmentType: MemoryFragmentType;
  continuityCategory: FragmentCategory;
  content: string;
  importanceScore: number;
  continuityWeight: number;
  continuityStabilityScore: number;
  continuityDecayRate: number;
  continuityLastReinforcedAt: string | null;
  reinforcementCount: number;
  lastReferencedAt: string | null;
  createdAt: string;
};

export type MemoryState = {
  currentGoals: string[];
  importantFacts: string[];
  decisions: string[];
  openLoops: string[];
  userPreferences: string[];
  recentSummary: string;
  lastUpdatedAt: string;
};

export type CompressionCandidate = {
  fragmentId: string;
  content: string;
  continuityCategory: FragmentCategory;
  score: number;
};

export type MemoryPerformanceMetrics = {
  contextAssemblyMs: number;
  memoryLookupMs: number;
  compressionMs: number;
  savepointMs: number;
  warning: string | null;
};

const MEMORY_SAVEPOINT_INTERVAL_MS = Number(
  process.env.CONTINUITY_MEMORY_SAVEPOINT_INTERVAL_MS ?? 3 * 60 * 1000,
);
const MEMORY_SAVEPOINT_MESSAGE_THRESHOLD = Number(
  process.env.CONTINUITY_MEMORY_SAVEPOINT_MESSAGE_THRESHOLD ?? 8,
);
const MAX_CONTEXT_FRAGMENTS = 6;
const MAX_STATE_ITEMS = 10;
const MAX_SAVEPOINTS_PER_WORKSPACE = Number(
  process.env.CONTINUITY_MEMORY_SAVEPOINT_ROTATION_LIMIT ?? 60,
);
const COMPRESSION_FRAGMENT_THRESHOLD = Number(
  process.env.CONTINUITY_COMPRESSION_FRAGMENT_THRESHOLD ?? 140,
);
const CONTEXT_ASSEMBLY_WARN_MS = Number(process.env.CONTINUITY_CONTEXT_ASSEMBLY_WARN_MS ?? 25);
export const CONTINUITY_DRIFT_WARNING_THRESHOLD = Number(
  process.env.CONTINUITY_DRIFT_WARNING_THRESHOLD ?? 0.42,
);

const memoryStateCache = new Map<
  string,
  {
    state: MemoryState;
    cachedAt: number;
  }
>();

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

function normalizeLower(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function unique(items: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = normalizeWhitespace(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function scoreFragment(type: MemoryFragmentType, content: string): number {
  const lower = normalizeLower(content);
  let score =
    type === "decision" || type === "project_goal"
      ? 0.86
      : type === "user_preference"
        ? 0.8
        : type === "open_loop"
          ? 0.78
          : type === "instruction"
            ? 0.7
            : type === "fact"
              ? 0.62
              : 0.54;
  if (/\b(must|never|always|critical|required)\b/.test(lower)) score += 0.08;
  if (/\?$/.test(lower)) score += 0.04;
  return Math.min(1, Number(score.toFixed(3)));
}

function continuityCategoryForType(type: MemoryFragmentType): FragmentCategory {
  if (type === "open_loop") return "open_loop";
  if (type === "project_goal") return "goal";
  if (type === "decision") return "decision";
  if (type === "instruction") return "instruction";
  if (type === "user_preference") return "profile_preference";
  return "operational_fact";
}

function continuityWeightForType(type: MemoryFragmentType): number {
  if (type === "open_loop") return 0.95;
  if (type === "project_goal") return 0.92;
  if (type === "decision") return 0.89;
  if (type === "user_preference") return 0.86;
  if (type === "instruction") return 0.8;
  return 0.72;
}

function continuityDecayRateForType(type: MemoryFragmentType): number {
  if (type === "open_loop" || type === "project_goal") return 0.015;
  if (type === "decision" || type === "user_preference") return 0.025;
  if (type === "instruction") return 0.03;
  return 0.045;
}

function stabilityScoreForType(type: MemoryFragmentType): number {
  if (type === "open_loop" || type === "project_goal") return 0.92;
  if (type === "decision") return 0.88;
  if (type === "user_preference") return 0.84;
  return 0.7;
}

function sentenceCandidates(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 12);
}

function extractPreferenceKey(value: string): string {
  return normalizeLower(value)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 64);
}

function classifyPreferenceCategory(content: string): ProfilePreferenceCategory {
  const lower = normalizeLower(content);
  if (/\b(ux|ui|simple|clean|minimal|layout)\b/.test(lower)) return "ux_preference";
  if (/\b(ollama|provider|model|local ai|assistant|external assistant)\b/.test(lower))
    return "provider_preference";
  if (/\b(workflow|step|copy\/paste|process|routine)\b/.test(lower))
    return "workflow_preference";
  if (/\b(continuity|recover|autosave|long-running|state)\b/.test(lower))
    return "continuity_preference";
  return "communication_preference";
}

function isPreferenceContradiction(a: string, b: string): boolean {
  const first = normalizeLower(a);
  const second = normalizeLower(b);
  if (first === second) return false;
  const polarity = /\b(no|not|never|avoid|without)\b/;
  return polarity.test(first) !== polarity.test(second);
}

function isTrivialChatter(content: string): boolean {
  const normalized = normalizeLower(content);
  if (
    normalized.length <= 18 &&
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)[!.?]*$/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function deriveFragmentsForMessage(input: {
  role: MessageRole;
  content: string;
  workspaceId: string;
  threadId: string;
  sourceMessageId: string;
  createdAt: string;
}): Array<
  Omit<
    MemoryFragment,
    "id" | "reinforcementCount" | "lastReferencedAt" | "continuityLastReinforcedAt"
  >
> {
  const content = normalizeWhitespace(input.content);
  if (!content || content.length < 12) return [];
  if (isTrivialChatter(content)) return [];
  const lower = normalizeLower(content);
  const fragments: Array<
    Omit<
      MemoryFragment,
      "id" | "reinforcementCount" | "lastReferencedAt" | "continuityLastReinforcedAt"
    >
  > = [];
  const add = (fragmentType: MemoryFragmentType, text: string) => {
    const trimmed = truncate(text, 360);
    if (!trimmed) return;
    fragments.push({
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      sourceMessageId: input.sourceMessageId,
      fragmentType,
      continuityCategory: continuityCategoryForType(fragmentType),
      content: trimmed,
      importanceScore: scoreFragment(fragmentType, trimmed),
      continuityWeight: continuityWeightForType(fragmentType),
      continuityStabilityScore: stabilityScoreForType(fragmentType),
      continuityDecayRate: continuityDecayRateForType(fragmentType),
      createdAt: input.createdAt,
    });
  };

  const candidates = sentenceCandidates(content);
  const topSentence = candidates[0] ?? content;

  if (
    /\b(prefer|preference|i want|we want|keep it|simple ux|local-first|chat-first|reliability|recoverability)\b/.test(
      lower,
    )
  ) {
    add("user_preference", topSentence);
  }
  if (/\b(goal|objective|implement|ship|build|foundation|phase)\b/.test(lower)) {
    add("project_goal", topSentence);
  }
  if (/\b(decided|decision|we will|we should|chosen|settled)\b/.test(lower)) {
    add("decision", topSentence);
  }
  if (
    /\b(open issue|todo|pending|follow up|later|unknown|question|blocker|risk)\b/.test(lower) ||
    /\?$/.test(content)
  ) {
    add("open_loop", topSentence);
  }
  if (/\b(do not|must|should|keep|ensure|never|always)\b/.test(lower)) {
    add("instruction", topSentence);
  }
  if (/\b(is|are|uses|has|contains|supports|remains)\b/.test(lower)) {
    add("fact", topSentence);
  }
  if (input.role === "assistant" && content.length > 120) {
    add("context_summary", topSentence);
  }

  if (fragments.length === 0) {
    add("fact", topSentence);
  }

  return fragments.slice(0, 3);
}

function insertMemoryFragments(
  db: Database.Database,
  fragments: Array<
    Omit<
      MemoryFragment,
      "id" | "reinforcementCount" | "lastReferencedAt" | "continuityLastReinforcedAt"
    >
  >,
): MemoryFragment[] {
  const inserted: MemoryFragment[] = [];
  const stmt = db.prepare(
    `INSERT INTO memory_fragments (
      id, workspace_id, thread_id, source_message_id, fragment_type, content, importance_score, metadata_json, created_at, memory_reinforcement_count, last_referenced_at, continuity_weight, continuity_category, continuity_stability_score, continuity_decay_rate, continuity_last_reinforced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const fragment of fragments) {
    const id = uuid();
    stmt.run(
      id,
      fragment.workspaceId,
      fragment.threadId,
      fragment.sourceMessageId,
      fragment.fragmentType,
      fragment.content,
      fragment.importanceScore,
      JSON.stringify({
        derived: true,
        sourceRole: db.prepare("SELECT role FROM messages WHERE id = ?").get(fragment.sourceMessageId),
      }),
      fragment.createdAt,
      0,
      null,
      fragment.continuityWeight,
      fragment.continuityCategory,
      fragment.continuityStabilityScore,
      fragment.continuityDecayRate,
      null,
    );
    inserted.push({
      id,
      ...fragment,
      reinforcementCount: 0,
      continuityStabilityScore: fragment.continuityStabilityScore,
      continuityDecayRate: fragment.continuityDecayRate,
      continuityLastReinforcedAt: null,
      lastReferencedAt: null,
    });
  }
  return inserted;
}

function refreshUserProfileMemory(
  db: Database.Database,
  fragments: MemoryFragment[],
): void {
  const preferenceFragments = fragments.filter((fragment) => fragment.fragmentType === "user_preference");
  if (preferenceFragments.length === 0) return;

  const upsert = db.prepare(
    `INSERT INTO user_profile_memory (
      id, workspace_id, preference_key, preference_value, confidence_score, source_fragment_id, source_message_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, preference_key) DO UPDATE SET
      preference_value = excluded.preference_value,
      confidence_score = excluded.confidence_score,
      source_fragment_id = excluded.source_fragment_id,
      source_message_id = excluded.source_message_id,
      updated_at = excluded.updated_at`,
  );

  for (const fragment of preferenceFragments) {
    const key = extractPreferenceKey(fragment.content);
    if (!key) continue;
    const now = fragment.createdAt;
    const existing = db
      .prepare(
        "SELECT preference_value, confidence_score FROM user_profile_memory WHERE workspace_id = ? AND preference_key = ?",
      )
      .get(fragment.workspaceId, key) as
      | { preference_value: string; confidence_score: number }
      | undefined;
    const contradictionPenalty =
      existing && isPreferenceContradiction(existing.preference_value, fragment.content) ? 0.2 : 0;
    const confidence = Math.max(
      0.2,
      Math.min(
        0.98,
        Number(
          (
            (existing ? Number(existing.confidence_score) : 0.5) * 0.7 +
            fragment.importanceScore * 0.45 -
            contradictionPenalty
          ).toFixed(3),
        ),
      ),
    );

    upsert.run(
      uuid(),
      fragment.workspaceId,
      `${classifyPreferenceCategory(fragment.content)}_${key}`,
      fragment.content,
      confidence,
      fragment.id,
      fragment.sourceMessageId,
      now,
      now,
    );
  }
}

function buildCurrentState(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): MemoryState {
  const fragmentRows = db
    .prepare(
      `SELECT fragment_type, content, created_at
       FROM memory_fragments
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at DESC
       LIMIT 260`,
    )
    .all(workspaceId, threadId) as Array<{
    fragment_type: MemoryFragmentType;
    content: string;
    created_at: string;
  }>;

  const profileRows = db
    .prepare(
      `SELECT preference_value
       FROM user_profile_memory
       WHERE workspace_id = ?
       ORDER BY confidence_score DESC, updated_at DESC
       LIMIT 24`,
    )
    .all(workspaceId) as Array<{ preference_value: string }>;

  const goals = unique(
    fragmentRows.filter((row) => row.fragment_type === "project_goal").map((row) => row.content),
    MAX_STATE_ITEMS,
  );
  const facts = unique(
    fragmentRows
      .filter((row) => row.fragment_type === "fact" || row.fragment_type === "context_summary")
      .map((row) => row.content),
    MAX_STATE_ITEMS,
  );
  const decisions = unique(
    fragmentRows.filter((row) => row.fragment_type === "decision").map((row) => row.content),
    MAX_STATE_ITEMS,
  );
  const openLoops = unique(
    fragmentRows.filter((row) => row.fragment_type === "open_loop").map((row) => row.content),
    MAX_STATE_ITEMS,
  );
  const preferences = unique(
    [
      ...profileRows.map((row) => row.preference_value),
      ...fragmentRows
        .filter((row) => row.fragment_type === "user_preference")
        .map((row) => row.content),
    ],
    MAX_STATE_ITEMS,
  );
  const summary = unique(fragmentRows.slice(0, 9).map((row) => row.content), 5).join(" ");

  return {
    currentGoals: goals,
    importantFacts: facts,
    decisions,
    openLoops,
    userPreferences: preferences,
    recentSummary: truncate(summary || "No memory summary yet.", 1000),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function upsertMemoryState(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    sourceMessageId: string;
  },
): MemoryState {
  const state = buildCurrentState(db, input.workspaceId, input.threadId);
  db.prepare(
    `INSERT INTO memory_states (
      id, workspace_id, thread_id, current_goals_json, important_facts_json, decisions_json, open_loops_json, user_preferences_json, recent_summary, source_message_id, last_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, thread_id) DO UPDATE SET
      current_goals_json = excluded.current_goals_json,
      important_facts_json = excluded.important_facts_json,
      decisions_json = excluded.decisions_json,
      open_loops_json = excluded.open_loops_json,
      user_preferences_json = excluded.user_preferences_json,
      recent_summary = excluded.recent_summary,
      source_message_id = excluded.source_message_id,
      last_updated_at = excluded.last_updated_at`,
  ).run(
    uuid(),
    input.workspaceId,
    input.threadId,
    JSON.stringify(state.currentGoals),
    JSON.stringify(state.importantFacts),
    JSON.stringify(state.decisions),
    JSON.stringify(state.openLoops),
    JSON.stringify(state.userPreferences),
    state.recentSummary,
    input.sourceMessageId,
    state.lastUpdatedAt,
  );
  memoryStateCache.set(`${input.workspaceId}:${input.threadId}`, { state, cachedAt: Date.now() });
  return state;
}

function collectCompressionCandidates(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): CompressionCandidate[] {
  const rows = db
    .prepare(
      `SELECT id, content, continuity_category, importance_score, memory_reinforcement_count, created_at
       FROM memory_fragments
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at ASC
       LIMIT 500`,
    )
    .all(workspaceId, threadId) as Array<{
    id: string;
    content: string;
    continuity_category: FragmentCategory;
    importance_score: number;
    memory_reinforcement_count: number;
    created_at: string;
  }>;

  const now = Date.now();
  return rows
    .map((row) => {
      const ageDays = Math.max(
        0.001,
        (now - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      const decay = 1 / Math.log(ageDays + 2.2);
      const score =
        Number(row.importance_score ?? 0) * 0.55 +
        Math.min(0.35, Number(row.memory_reinforcement_count ?? 0) * 0.03) +
        decay * 0.1;
      return {
        fragmentId: row.id,
        content: row.content,
        continuityCategory: row.continuity_category,
        score: Number(score.toFixed(4)),
      };
    })
    .filter((candidate) => candidate.score < 0.62);
}

function maybeCompressMemory(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    sourceMessageId: string;
    reasonHint: "message_threshold" | "autosave_interval" | "idle_period";
  },
): number {
  const fragmentCount = db
    .prepare(
      "SELECT COUNT(*) AS c FROM memory_fragments WHERE workspace_id = ? AND thread_id = ?",
    )
    .get(input.workspaceId, input.threadId) as { c: number };
  if ((fragmentCount.c ?? 0) < COMPRESSION_FRAGMENT_THRESHOLD) return 0;

  const candidates = collectCompressionCandidates(db, input.workspaceId, input.threadId);
  if (candidates.length < 8) return 0;

  const selected = candidates.slice(0, Math.min(60, candidates.length));
  const shortTerm = truncate(unique(selected.map((candidate) => candidate.content), 6).join(" "), 680);
  const mediumTerm = truncate(unique(selected.map((candidate) => candidate.content), 12).join(" "), 1400);
  const longTerm = truncate(unique(selected.map((candidate) => candidate.content), 22).join(" "), 2600);
  const summary = truncate(
    unique(selected.map((candidate) => candidate.content), 18).join(" "),
    2600,
  );
  const categories = unique(selected.map((candidate) => candidate.continuityCategory), 8);
  const qualityScore = Number(
    Math.min(
      0.99,
      0.45 +
        Math.min(0.35, categories.length * 0.05) +
        Math.min(0.19, selected.length / 500),
    ).toFixed(3),
  );
  const hints = {
    sourceFragmentCount: selected.length,
    preserveReferenceIds: selected.map((candidate) => candidate.fragmentId),
    rebuild: "Reconstruct by replaying source fragment ids and canonical messages if needed.",
    shortTermSummary: shortTerm,
    mediumTermSummary: mediumTerm,
    longTermOperationalIdentitySummary: longTerm,
  };

  db.prepare(
    `INSERT INTO compressed_memory_states (
      id, workspace_id, thread_id, source_fragment_ids_json, generated_summary, continuity_categories_json, reconstruction_hints_json, compressed_at, source_message_checkpoint, compression_reason, compression_quality_score, summary_tier, archival_state_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    input.workspaceId,
    input.threadId,
    JSON.stringify(selected.map((candidate) => candidate.fragmentId)),
    summary,
    JSON.stringify(categories),
    JSON.stringify(hints),
    new Date().toISOString(),
    input.sourceMessageId,
    input.reasonHint,
    qualityScore,
    "rolling_operational",
    JSON.stringify({
      shortTermSummary: shortTerm,
      mediumTermSummary: mediumTerm,
      longTermOperationalIdentitySummary: longTerm,
      historicalContinuityBundle: summary,
    }),
  );

  return selected.length;
}

function rotateSavepoints(db: Database.Database, workspaceId: string): void {
  const rows = db
    .prepare(
      `SELECT id
       FROM memory_savepoints
       WHERE workspace_id = ?
       ORDER BY created_at DESC`,
    )
    .all(workspaceId) as Array<{ id: string }>;
  if (rows.length <= MAX_SAVEPOINTS_PER_WORKSPACE) return;
  const idsToDelete = rows.slice(MAX_SAVEPOINTS_PER_WORKSPACE).map((row) => row.id);
  const del = db.prepare("DELETE FROM memory_savepoints WHERE id = ?");
  for (const id of idsToDelete) del.run(id);
}

function maybeCreateMemorySavepoint(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    sourceMessageId: string;
    state: MemoryState;
    createdAt: string;
  },
): { created: boolean; reason: "autosave_interval" | "message_threshold" | null; elapsedMs: number } {
  const start = performance.now();
  const last = db
    .prepare(
      `SELECT id, created_at, recent_message_checkpoint
       FROM memory_savepoints
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(input.workspaceId) as
    | { id: string; created_at: string; recent_message_checkpoint: string }
    | undefined;

  const createdMs = new Date(input.createdAt).getTime();
  const lastMs = last ? new Date(last.created_at).getTime() : 0;
  const intervalDue = !last || createdMs - lastMs >= MEMORY_SAVEPOINT_INTERVAL_MS;

  let reason: "autosave_interval" | "message_threshold" | null = null;
  if (intervalDue) {
    reason = "autosave_interval";
  } else if (last) {
    const sinceCount = db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM messages
         WHERE thread_id = ?
           AND (created_at > (SELECT created_at FROM messages WHERE id = ?)
              OR (created_at = (SELECT created_at FROM messages WHERE id = ?) AND id > ?))`,
      )
      .get(
        input.threadId,
        last.recent_message_checkpoint,
        last.recent_message_checkpoint,
        last.recent_message_checkpoint,
      ) as { c: number };
    if ((sinceCount.c ?? 0) >= MEMORY_SAVEPOINT_MESSAGE_THRESHOLD) {
      reason = "message_threshold";
    }
  }
  if (!reason) {
    return { created: false, reason: null, elapsedMs: performance.now() - start };
  }

  const fragmentCount = db
    .prepare("SELECT COUNT(*) AS c FROM memory_fragments WHERE workspace_id = ?")
    .get(input.workspaceId) as { c: number };

  db.prepare(
    `INSERT INTO memory_savepoints (
      id, workspace_id, active_thread_id, recent_message_checkpoint, continuity_state_snapshot_json, memory_fragment_count, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    input.workspaceId,
    input.threadId,
    input.sourceMessageId,
    JSON.stringify({
      currentGoals: input.state.currentGoals,
      importantFacts: input.state.importantFacts,
      decisions: input.state.decisions,
      openLoops: input.state.openLoops,
      userPreferences: input.state.userPreferences,
      recentSummary: input.state.recentSummary,
      lastUpdatedAt: input.state.lastUpdatedAt,
    }),
    fragmentCount.c ?? 0,
    reason,
    input.createdAt,
  );
  rotateSavepoints(db, input.workspaceId);
  return { created: true, reason, elapsedMs: performance.now() - start };
}

function canDeriveFromMessage(content: string): boolean {
  const text = normalizeWhitespace(content);
  return text.length >= 8;
}

export function processMemoryForMessage(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    messageId: string;
    role: MessageRole;
    content: string;
    createdAt: string;
  },
): MemoryPerformanceMetrics | null {
  if (!canDeriveFromMessage(input.content)) return null;
  const overallStart = performance.now();
  const lookupStart = performance.now();

  const fragments = deriveFragmentsForMessage({
    role: input.role,
    content: input.content,
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    sourceMessageId: input.messageId,
    createdAt: input.createdAt,
  });
  if (fragments.length === 0) return null;
  const inserted = insertMemoryFragments(db, fragments);
  refreshUserProfileMemory(db, inserted);
  const state = upsertMemoryState(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    sourceMessageId: input.messageId,
  });
  const savepoint = maybeCreateMemorySavepoint(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    sourceMessageId: input.messageId,
    state,
    createdAt: input.createdAt,
  });
  const lookupMs = performance.now() - lookupStart;

  const compressionStart = performance.now();
  const compressed = maybeCompressMemory(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    sourceMessageId: input.messageId,
    reasonHint: savepoint.reason ?? "message_threshold",
  });
  const compressionMs = performance.now() - compressionStart;
  const total = performance.now() - overallStart;

  return {
    contextAssemblyMs: Number(total.toFixed(3)),
    memoryLookupMs: Number(lookupMs.toFixed(3)),
    compressionMs: Number(compressionMs.toFixed(3)),
    savepointMs: Number(savepoint.elapsedMs.toFixed(3)),
    warning:
      total > CONTEXT_ASSEMBLY_WARN_MS
        ? `continuity-memory-slow:${total.toFixed(1)}ms`
        : compressed > 0
          ? `compression-ran:${compressed}`
          : null,
  };
}

export function processMemoryForMessageNonBlocking(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    messageId: string;
    role: MessageRole;
    content: string;
    createdAt: string;
  },
): MemoryPerformanceMetrics | null {
  try {
    return processMemoryForMessage(db, input);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[continuity] memory derivation skipped", error);
    }
    return null;
  }
}

export function getMemoryState(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): MemoryState | null {
  const cacheKey = `${workspaceId}:${threadId}`;
  const cached = memoryStateCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 5000) {
    return cached.state;
  }

  const row = db
    .prepare(
      `SELECT current_goals_json, important_facts_json, decisions_json, open_loops_json, user_preferences_json, recent_summary, last_updated_at
       FROM memory_states
       WHERE workspace_id = ? AND thread_id = ?
       LIMIT 1`,
    )
    .get(workspaceId, threadId) as
    | {
      current_goals_json: string;
      important_facts_json: string;
      decisions_json: string;
      open_loops_json: string;
      user_preferences_json: string;
      recent_summary: string;
      last_updated_at: string;
    }
    | undefined;
  if (!row) return null;
  const state = {
    currentGoals: safeParseJsonArray(row.current_goals_json),
    importantFacts: safeParseJsonArray(row.important_facts_json),
    decisions: safeParseJsonArray(row.decisions_json),
    openLoops: safeParseJsonArray(row.open_loops_json),
    userPreferences: safeParseJsonArray(row.user_preferences_json),
    recentSummary: row.recent_summary,
    lastUpdatedAt: row.last_updated_at,
  };
  memoryStateCache.set(cacheKey, { state, cachedAt: Date.now() });
  return state;
}

function relevanceScore(input: {
  row: {
    content: string;
    fragment_type: MemoryFragmentType;
    continuity_category: FragmentCategory;
    importance_score: number;
    created_at: string;
    memory_reinforcement_count: number;
    continuity_weight: number;
    continuity_stability_score: number;
    continuity_decay_rate: number;
    continuity_last_reinforced_at: string | null;
  };
  terms: string[];
  nowMs: number;
}): number {
  const haystack = normalizeLower(input.row.content);
  const termHits = input.terms.filter((term) => haystack.includes(term)).length;
  if (termHits === 0) return 0;

  const ageDays = Math.max(
    0.001,
    (input.nowMs - new Date(input.row.created_at).getTime()) / (1000 * 60 * 60 * 24),
  );
  const decayRate = Math.max(0.005, Number(input.row.continuity_decay_rate ?? 0.04));
  const recency = Math.exp(-decayRate * ageDays);
  const importance = Number(input.row.importance_score ?? 0);
  const continuityWeight = Number(input.row.continuity_weight ?? 0.5);
  const stability = Number(input.row.continuity_stability_score ?? 0.5);
  const reinforcementBoost = Math.min(0.35, Number(input.row.memory_reinforcement_count ?? 0) * 0.04);
  const lastReinforcedBoost = input.row.continuity_last_reinforced_at ? 0.03 : 0;
  const categoryWeight =
    input.row.continuity_category === "open_loop"
      ? 1
      : input.row.continuity_category === "goal"
        ? 0.95
        : input.row.continuity_category === "decision"
          ? 0.9
          : input.row.continuity_category === "profile_preference"
            ? 0.86
            : 0.75;
  const typeWeight =
    input.row.fragment_type === "open_loop"
      ? 1
      : input.row.fragment_type === "project_goal"
        ? 0.95
        : input.row.fragment_type === "decision"
          ? 0.9
          : input.row.fragment_type === "user_preference"
            ? 0.86
            : 0.7;
  const overlapScore = Math.min(1, termHits / Math.max(1, input.terms.length));
  return Number(
    (
      importance * 0.25 +
      recency * 0.18 +
      overlapScore * 0.16 +
      continuityWeight * 0.12 +
      categoryWeight * 0.1 +
      typeWeight * 0.06 +
      stability * 0.08 +
      reinforcementBoost +
      lastReinforcedBoost
    ).toFixed(4),
  );
}

export function listRelevantMemoryFragments(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    query: string;
    limit?: number;
  },
): MemoryFragment[] {
  const terms = unique(
    normalizeLower(input.query)
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3),
    10,
  );
  if (terms.length === 0) return [];

  const limit = input.limit ?? MAX_CONTEXT_FRAGMENTS;
  const rows = db
    .prepare(
      `SELECT id, workspace_id, thread_id, source_message_id, fragment_type, continuity_category, content, importance_score, continuity_weight, memory_reinforcement_count, last_referenced_at, created_at, continuity_stability_score, continuity_decay_rate, continuity_last_reinforced_at
       FROM memory_fragments
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at DESC
       LIMIT 400`,
    )
    .all(input.workspaceId, input.threadId) as Array<{
    id: string;
    workspace_id: string;
    thread_id: string;
    source_message_id: string;
    fragment_type: MemoryFragmentType;
    continuity_category: FragmentCategory;
    content: string;
    importance_score: number;
    continuity_weight: number;
    memory_reinforcement_count: number;
    last_referenced_at: string | null;
    created_at: string;
    continuity_stability_score: number;
    continuity_decay_rate: number;
    continuity_last_reinforced_at: string | null;
  }>;

  const now = Date.now();
  const scored = rows
    .map((row) => ({
      row,
      relevance: relevanceScore({ row, terms, nowMs: now }),
    }))
    .filter((entry) => entry.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);

  const capped: typeof scored = [];
  const categoryCount = new Map<string, number>();
  const seenContent = new Set<string>();
  for (const item of scored) {
    if (capped.length >= limit) break;
    const c = item.row.continuity_category;
    const used = categoryCount.get(c) ?? 0;
    if (used >= 3) continue; // saturation prevention per category
    const contentKey = normalizeLower(item.row.content).slice(0, 120);
    if (seenContent.has(contentKey)) continue; // anti-repetition
    seenContent.add(contentKey);
    categoryCount.set(c, used + 1);
    capped.push(item);
  }

  if (capped.length > 0) {
    const nowIso = new Date().toISOString();
    const update = db.prepare(
      `UPDATE memory_fragments
       SET memory_reinforcement_count = memory_reinforcement_count + 1,
           last_referenced_at = ?,
           continuity_last_reinforced_at = ?,
           continuity_stability_score = MIN(1, continuity_stability_score + 0.01)
       WHERE id = ?`,
    );
    for (const { row } of capped) {
      update.run(nowIso, nowIso, row.id);
    }
  }

  return capped.map(({ row }) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    threadId: row.thread_id,
    sourceMessageId: row.source_message_id,
    fragmentType: row.fragment_type,
    continuityCategory: row.continuity_category,
    content: row.content,
    importanceScore: Number(row.importance_score),
    continuityWeight: Number(row.continuity_weight),
    continuityStabilityScore: Number(row.continuity_stability_score ?? 0.5),
    continuityDecayRate: Number(row.continuity_decay_rate ?? 0.04),
    continuityLastReinforcedAt: row.continuity_last_reinforced_at,
    reinforcementCount: Number(row.memory_reinforcement_count),
    lastReferencedAt: row.last_referenced_at,
    createdAt: row.created_at,
  }));
}

export function getCompressionCandidates(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): CompressionCandidate[] {
  return collectCompressionCandidates(db, workspaceId, threadId).slice(0, 20);
}

export function getContinuityEvolutionStats(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): {
  activeStateCount: number;
  rollingStateCount: number;
  compressedStateCount: number;
  archivedStateCount: number;
  avgStabilityScore: number;
  avgDecayRate: number;
} {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS c, AVG(continuity_stability_score) AS stability, AVG(continuity_decay_rate) AS decay
       FROM memory_fragments
       WHERE workspace_id = ? AND thread_id = ?`,
    )
    .get(workspaceId, threadId) as { c: number; stability: number | null; decay: number | null };
  const compressed = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM compressed_memory_states
       WHERE workspace_id = ? AND thread_id = ?`,
    )
    .get(workspaceId, threadId) as { c: number };

  return {
    activeStateCount: Number(active.c ?? 0),
    rollingStateCount: Number(Math.max(0, (active.c ?? 0) - 15)),
    compressedStateCount: Number(compressed.c ?? 0),
    archivedStateCount: Number(Math.max(0, (compressed.c ?? 0) - 5)),
    avgStabilityScore: Number((active.stability ?? 0.5).toFixed(3)),
    avgDecayRate: Number((active.decay ?? 0.04).toFixed(4)),
  };
}

export function scoreContinuityReconstruction(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    query: string;
  },
): {
  continuityConfidenceScore: number;
  continuityDriftScore: number;
  continuityReconstructionHealth: number;
  continuityFidelityScore: number;
  operationalConsistencyScore: number;
  emotionalContinuityScore: number;
  driftWarningThreshold: number;
  needsCorrection: boolean;
  hasContinuityConflict: boolean;
  reconstructionSources: string[];
} {
  const state = getMemoryState(db, input.workspaceId, input.threadId);
  const relevant = listRelevantMemoryFragments(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query: input.query,
    limit: 8,
  });
  const canonicalRecent = db
    .prepare(
      `SELECT content
       FROM messages
       WHERE thread_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
    )
    .all(input.threadId) as Array<{ content: string }>;
  const canonicalBlob = normalizeLower(canonicalRecent.map((row) => row.content).join(" "));
  const reconstructedBlob = normalizeLower(
    `${state?.recentSummary ?? ""} ${relevant.map((row) => row.content).join(" ")}`,
  );
  const canonicalTerms = unique(
    canonicalBlob.split(/[^a-z0-9]+/).filter((term) => term.length >= 4),
    80,
  );
  const overlapCount = canonicalTerms.filter((term) => reconstructedBlob.includes(term)).length;
  const overlapRatio = canonicalTerms.length > 0 ? overlapCount / canonicalTerms.length : 0.7;
  const hasContinuityConflict =
    state != null &&
    state.currentGoals.some((goal) => state.decisions.some((decision) => isPreferenceContradiction(goal, decision)));
  const confidence = Number(
    Math.min(0.99, 0.45 + overlapRatio * 0.4 + Math.min(0.14, relevant.length * 0.02)).toFixed(3),
  );
  const drift = Number((1 - overlapRatio).toFixed(3));
  const health = Number((Math.max(0, confidence - drift * 0.5)).toFixed(3));
  const continuityFidelityScore = Number((Math.max(0, overlapRatio)).toFixed(3));
  const operationalConsistencyScore = Number(
    Math.max(0, Math.min(1, health + (hasContinuityConflict ? -0.15 : 0.08))).toFixed(3),
  );
  const emotionalContinuityScore = Number(
    Math.max(
      0,
      Math.min(
        1,
        (state?.userPreferences.length ? 0.25 : 0.1) +
          (state?.currentGoals.length ? 0.25 : 0.1) +
          Math.min(0.4, relevant.length * 0.05),
      ),
    ).toFixed(3),
  );
  const needsCorrection =
    drift >= CONTINUITY_DRIFT_WARNING_THRESHOLD ||
    (relevant.length === 0 && confidence < 0.72) ||
    confidence < 0.55 ||
    hasContinuityConflict;
  const sources = [
    "recent_messages",
    "memory_state",
    "relevant_fragments",
    "user_profile_memory",
    "compressed_memory_states",
  ];
  return {
    continuityConfidenceScore: confidence,
    continuityDriftScore: drift,
    continuityReconstructionHealth: health,
    continuityFidelityScore,
    operationalConsistencyScore,
    emotionalContinuityScore,
    driftWarningThreshold: CONTINUITY_DRIFT_WARNING_THRESHOLD,
    needsCorrection,
    hasContinuityConflict,
    reconstructionSources: sources,
  };
}

export function persistContinuityValidationSnapshot(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    reconstruction: ReturnType<typeof scoreContinuityReconstruction>;
  },
): string {
  const id = uuid();
  db.prepare(
    `INSERT INTO continuity_validation_snapshots (
      id, workspace_id, thread_id, continuity_reconstruction_health, continuity_drift_score, warning_threshold, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.threadId,
    input.reconstruction.continuityReconstructionHealth,
    input.reconstruction.continuityDriftScore,
    input.reconstruction.driftWarningThreshold,
    new Date().toISOString(),
    JSON.stringify({
      confidence: input.reconstruction.continuityConfidenceScore,
      fidelity: input.reconstruction.continuityFidelityScore,
      operationalConsistency: input.reconstruction.operationalConsistencyScore,
      emotionalContinuity: input.reconstruction.emotionalContinuityScore,
      sources: input.reconstruction.reconstructionSources,
      needsCorrection: input.reconstruction.needsCorrection,
      hasContinuityConflict: input.reconstruction.hasContinuityConflict,
    }),
  );
  return id;
}

export function persistCalibrationSnapshot(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    reconstruction: ReturnType<typeof scoreContinuityReconstruction>;
  },
): string {
  const id = uuid();
  db.prepare(
    `INSERT INTO runtime_calibration_snapshots (
      id, workspace_id, thread_id, continuity_fidelity_score, operational_consistency_score, emotional_continuity_score, continuity_reconstruction_health, continuity_drift_score, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.threadId,
    input.reconstruction.continuityFidelityScore,
    input.reconstruction.operationalConsistencyScore,
    input.reconstruction.emotionalContinuityScore,
    input.reconstruction.continuityReconstructionHealth,
    input.reconstruction.continuityDriftScore,
    new Date().toISOString(),
    JSON.stringify({
      confidence: input.reconstruction.continuityConfidenceScore,
      needsCorrection: input.reconstruction.needsCorrection,
      conflict: input.reconstruction.hasContinuityConflict,
    }),
  );
  return id;
}

export function buildContinuityFeelingBlock(input: {
  state: MemoryState | null;
  fragments: MemoryFragment[];
}): string | null {
  if (!input.state && input.fragments.length === 0) return null;
  const goals = input.state?.currentGoals.slice(0, 2) ?? [];
  const loops = input.state?.openLoops.slice(0, 2) ?? [];
  const recurring = input.fragments
    .filter((fragment) => fragment.reinforcementCount >= 3)
    .slice(0, 2)
    .map((fragment) => fragment.content);
  const hints: string[] = [];
  if (goals.length > 0) hints.push(`Ongoing: ${goals.join("; ")}`);
  if (loops.length > 0) hints.push(`Open: ${loops.join("; ")}`);
  if (recurring.length > 0) hints.push(`Carry forward: ${recurring.join("; ")}`);
  if (hints.length === 0 && input.state?.recentSummary) {
    hints.push(truncate(input.state.recentSummary, 220));
  }
  return hints.length > 0 ? hints.join("\n") : null;
}

export function rebuildDerivedMemoryFromCanonical(
  db: Database.Database,
  input: { workspaceId: string; threadId: string },
): { rebuiltFragments: number; rebuiltState: boolean } {
  db.prepare("DELETE FROM memory_fragments WHERE workspace_id = ? AND thread_id = ?").run(
    input.workspaceId,
    input.threadId,
  );
  db.prepare("DELETE FROM memory_states WHERE workspace_id = ? AND thread_id = ?").run(
    input.workspaceId,
    input.threadId,
  );
  db.prepare(
    "DELETE FROM user_profile_memory WHERE workspace_id = ?",
  ).run(input.workspaceId);

  const messages = db
    .prepare(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE thread_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(input.threadId) as Array<{
    id: string;
    role: MessageRole;
    content: string;
    created_at: string;
  }>;

  let rebuiltFragments = 0;
  for (const message of messages) {
    const result = processMemoryForMessageNonBlocking(db, {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      messageId: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    });
    if (result != null) {
      const rows = db
        .prepare(
          "SELECT COUNT(*) AS c FROM memory_fragments WHERE thread_id = ? AND source_message_id = ?",
        )
        .get(input.threadId, message.id) as { c: number };
      rebuiltFragments += rows.c;
    }
  }
  const state = getMemoryState(db, input.workspaceId, input.threadId);
  return {
    rebuiltFragments,
    rebuiltState: state != null,
  };
}

export function buildMemoryStateContextBlock(state: MemoryState | null): string | null {
  if (!state) return null;
  const lines: string[] = [];
  if (state.currentGoals.length > 0) {
    lines.push(`Current goals: ${state.currentGoals.slice(0, 5).join("; ")}`);
  }
  if (state.decisions.length > 0) {
    lines.push(`Decisions: ${state.decisions.slice(0, 5).join("; ")}`);
  }
  if (state.openLoops.length > 0) {
    lines.push(`Open loops: ${state.openLoops.slice(0, 5).join("; ")}`);
  }
  if (state.userPreferences.length > 0) {
    lines.push(`User preferences: ${state.userPreferences.slice(0, 5).join("; ")}`);
  }
  if (state.importantFacts.length > 0) {
    lines.push(`Important facts: ${state.importantFacts.slice(0, 5).join("; ")}`);
  }
  lines.push(`Recent summary: ${truncate(state.recentSummary, 1000)}`);
  return lines.join("\n\n").trim() || null;
}

export function buildRelevantFragmentsContextBlock(fragments: MemoryFragment[]): string | null {
  if (fragments.length === 0) return null;
  const lines = fragments.map(
    (fragment) =>
      `- [${fragment.fragmentType}/${fragment.continuityCategory}] ${truncate(fragment.content, 260)} (source message: ${fragment.sourceMessageId}, relevance signals: importance=${fragment.importanceScore.toFixed(2)}, reinforcement=${fragment.reinforcementCount})`,
  );
  return lines.join("\n");
}
