import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { MessageRole } from "../../../src/shared/types";
import { getAssistantProfile } from "./assistant-profile-service";
import {
  calculateContinuityHealthMetrics,
  extractOpenQuestions,
  extractProjectDecisions,
  generateProjectTimeline,
  rebuildIntelligenceFromHistory,
  type OpenQuestionRecord,
} from "./continuity-intelligence-service";
import { getMemoryState } from "./memory-state-service";

export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type LongTermGoal = {
  id: string;
  workspaceId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  goal: string;
  status: GoalStatus;
  confidenceScore: number;
  lastReferencedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ActiveProject = {
  id: string;
  workspaceId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  projectName: string;
  currentObjective: string;
  lastActivityAt: string;
  continuityConfidence: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAchievement = {
  id: string;
  workspaceId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  projectName: string;
  achievement: string;
  completedAt: string;
  confidenceScore: number;
  createdAt: string;
};

export type AssistantHistoryEntry = {
  id: string;
  workspaceId: string;
  eventTitle: string;
  eventDescription: string;
  occurredAt: string;
  eventKind: "created" | "renamed" | "milestone" | "capability";
  createdAt: string;
};

export type RecurringInterest = {
  id: string;
  workspaceId: string;
  interest: string;
  mentionCount: number;
  confidenceScore: number;
  lastReferencedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AiLifeSnapshot = {
  workspaceId: string;
  workspaceName: string;
  generatedAt: string;
  aiLifeScore: number;
  currentGoals: string[];
  activeProjects: string[];
  completedProjects: string[];
  recentProgress: string[];
  openQuestions: string[];
  assistantHistory: string[];
  currentPriorities: string[];
  markdown: string;
};

export type AiLifeHealthMetrics = {
  aiLifeCoverage: number;
  goalCoverage: number;
  projectCoverage: number;
  rebuildConfidence: number;
  assistantHistoryCoverage: number;
};

export type AiLifeAnalysis = {
  goals: LongTermGoal[];
  activeProjects: ActiveProject[];
  completedProjects: ProjectAchievement[];
  recurringInterests: RecurringInterest[];
  assistantHistory: AssistantHistoryEntry[];
  openQuestions: OpenQuestionRecord[];
  health: AiLifeHealthMetrics;
  aiLifeScore: number;
};

export type AiLifeExport = {
  version: 1;
  goals: LongTermGoal[];
  projects: ActiveProject[];
  achievements: ProjectAchievement[];
  interests: RecurringInterest[];
  assistantHistory: AssistantHistoryEntry[];
  latestSnapshot: AiLifeSnapshot | null;
  health: AiLifeHealthMetrics | null;
};

const GOAL_RE =
  /\b(my goal|goal is|goal:|working toward|trying to|plan to build|want to launch|objective is|long.?term goal|build\s+[A-Z][\w]+|launch\s+[A-Z][\w]+)\b/i;
const PROJECT_RE =
  /\b(working on|building|developing|shipping|project:|initiative:|major initiative)\b/i;
const COMPLETED_RE =
  /\b(finished|completed|shipped|released|done with|archived|wrapped up|launched)\b/i;
const INTEREST_RE = /\b(interested in|focus on|learning|exploring|working on)\b/i;
const PROFILING_BLOCK_RE =
  /\b(you seem|personality|mental health|political|trait|diagnos|introvert|extrovert|anxious|depressed|beliefs? about)\b/i;

const KNOWN_ASSISTANT_MILESTONES: Array<{ match: RegExp; title: string; description: string }> = [
  {
    match: /assistant identity/i,
    title: "Identity Layer Added",
    description: "Assistant identity layer configured for continuity.",
  },
  {
    match: /provider independence/i,
    title: "Provider Independence Added",
    description: "Multi-provider chat independence adopted.",
  },
  {
    match: /continuity intelligence/i,
    title: "Continuity Intelligence Added",
    description: "Continuity intelligence engine enabled.",
  },
  {
    match: /ai life/i,
    title: "AI Life Engine Added",
    description: "Operational AI Life tracking enabled.",
  },
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

function uniqueKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function isOperationalContent(content: string): boolean {
  const lower = normalizeWhitespace(content).toLowerCase();
  if (PROFILING_BLOCK_RE.test(lower)) return false;
  if (lower.length < 8) return false;
  return true;
}

function sentenceCandidates(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 12 && isOperationalContent(line));
}

function mapGoalRow(row: Record<string, unknown>): LongTermGoal {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: row.thread_id != null ? String(row.thread_id) : null,
    sourceMessageId: row.source_message_id != null ? String(row.source_message_id) : null,
    goal: String(row.goal),
    status: String(row.status) as GoalStatus,
    confidenceScore: Number(row.confidence_score),
    lastReferencedAt: String(row.last_referenced_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProjectRow(row: Record<string, unknown>): ActiveProject {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: row.thread_id != null ? String(row.thread_id) : null,
    sourceMessageId: row.source_message_id != null ? String(row.source_message_id) : null,
    projectName: String(row.project_name),
    currentObjective: String(row.current_objective),
    lastActivityAt: String(row.last_activity_at),
    continuityConfidence: Number(row.continuity_confidence),
    status: String(row.status) as ProjectStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAchievementRow(row: Record<string, unknown>): ProjectAchievement {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: row.thread_id != null ? String(row.thread_id) : null,
    sourceMessageId: row.source_message_id != null ? String(row.source_message_id) : null,
    projectName: String(row.project_name),
    achievement: String(row.achievement),
    completedAt: String(row.completed_at),
    confidenceScore: Number(row.confidence_score),
    createdAt: String(row.created_at),
  };
}

function mapAssistantHistoryRow(row: Record<string, unknown>): AssistantHistoryEntry {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    eventTitle: String(row.event_title),
    eventDescription: String(row.event_description),
    occurredAt: String(row.occurred_at),
    eventKind: String(row.event_kind) as AssistantHistoryEntry["eventKind"],
    createdAt: String(row.created_at),
  };
}

function mapInterestRow(row: Record<string, unknown>): RecurringInterest {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    interest: String(row.interest),
    mentionCount: Number(row.mention_count),
    confidenceScore: Number(row.confidence_score),
    lastReferencedAt: String(row.last_referenced_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function upsertGoal(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string | null;
    sourceMessageId: string | null;
    goal: string;
    status?: GoalStatus;
    confidenceScore: number;
    lastReferencedAt: string;
  },
): LongTermGoal {
  const key = uniqueKey(input.goal);
  const existing = db
    .prepare("SELECT id, status FROM ai_life_goals WHERE workspace_id = ? AND lower(goal) = ?")
    .get(input.workspaceId, key) as { id: string; status: string } | undefined;
  const now = new Date().toISOString();
  const id = existing?.id ?? uuid();
  const status = input.status ?? (existing?.status as GoalStatus) ?? "active";
  if (existing) {
    db.prepare(
      `UPDATE ai_life_goals SET
        confidence_score = ?, last_referenced_at = ?, updated_at = ?, status = ?,
        source_message_id = COALESCE(?, source_message_id), thread_id = COALESCE(?, thread_id)
       WHERE id = ?`,
    ).run(
      input.confidenceScore,
      input.lastReferencedAt,
      now,
      status,
      input.sourceMessageId,
      input.threadId,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO ai_life_goals (
        id, workspace_id, thread_id, source_message_id, goal, status,
        confidence_score, last_referenced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.workspaceId,
      input.threadId,
      input.sourceMessageId,
      input.goal,
      status,
      input.confidenceScore,
      input.lastReferencedAt,
      now,
      now,
    );
  }
  return mapGoalRow(db.prepare("SELECT * FROM ai_life_goals WHERE id = ?").get(id) as Record<string, unknown>);
}

function upsertProject(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string | null;
    sourceMessageId: string | null;
    projectName: string;
    currentObjective: string;
    lastActivityAt: string;
    continuityConfidence: number;
    status?: ProjectStatus;
  },
): ActiveProject {
  const key = uniqueKey(input.projectName);
  const existing = db
    .prepare("SELECT id, status FROM ai_life_projects WHERE workspace_id = ? AND lower(project_name) = ?")
    .get(input.workspaceId, key) as { id: string; status: string } | undefined;
  const now = new Date().toISOString();
  const id = existing?.id ?? uuid();
  const status = input.status ?? (existing?.status as ProjectStatus) ?? "active";
  if (existing) {
    db.prepare(
      `UPDATE ai_life_projects SET
        current_objective = ?, last_activity_at = ?, continuity_confidence = ?,
        updated_at = ?, status = ?, source_message_id = COALESCE(?, source_message_id)
       WHERE id = ?`,
    ).run(
      input.currentObjective,
      input.lastActivityAt,
      input.continuityConfidence,
      now,
      status,
      input.sourceMessageId,
      id,
    );
  } else {
    db.prepare(
      `INSERT INTO ai_life_projects (
        id, workspace_id, thread_id, source_message_id, project_name, current_objective,
        last_activity_at, continuity_confidence, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.workspaceId,
      input.threadId,
      input.sourceMessageId,
      input.projectName,
      input.currentObjective,
      input.lastActivityAt,
      input.continuityConfidence,
      status,
      now,
      now,
    );
  }
  return mapProjectRow(
    db.prepare("SELECT * FROM ai_life_projects WHERE id = ?").get(id) as Record<string, unknown>,
  );
}

function insertAchievement(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string | null;
    sourceMessageId: string | null;
    projectName: string;
    achievement: string;
    completedAt: string;
    confidenceScore: number;
  },
): ProjectAchievement {
  const key = uniqueKey(`${input.projectName}:${input.achievement}`);
  const existing = db
    .prepare(
      "SELECT id FROM ai_life_achievements WHERE workspace_id = ? AND lower(project_name || ':' || achievement) = ?",
    )
    .get(input.workspaceId, key) as { id: string } | undefined;
  if (existing) {
    return mapAchievementRow(
      db.prepare("SELECT * FROM ai_life_achievements WHERE id = ?").get(existing.id) as Record<
        string,
        unknown
      >,
    );
  }
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_life_achievements (
      id, workspace_id, thread_id, source_message_id, project_name, achievement,
      completed_at, confidence_score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.threadId,
    input.sourceMessageId,
    input.projectName,
    input.achievement,
    input.completedAt,
    input.confidenceScore,
    now,
  );
  return mapAchievementRow(
    db.prepare("SELECT * FROM ai_life_achievements WHERE id = ?").get(id) as Record<string, unknown>,
  );
}

export function recordAssistantHistoryEvent(
  db: Database.Database,
  input: {
    workspaceId: string;
    eventTitle: string;
    eventDescription: string;
    occurredAt: string;
    eventKind?: AssistantHistoryEntry["eventKind"];
  },
): AssistantHistoryEntry {
  const key = uniqueKey(`${input.eventTitle}:${input.occurredAt.slice(0, 10)}`);
  const existing = db
    .prepare(
      "SELECT id FROM ai_life_assistant_history WHERE workspace_id = ? AND lower(event_title) = ?",
    )
    .get(input.workspaceId, uniqueKey(input.eventTitle)) as { id: string } | undefined;
  if (existing) {
    return mapAssistantHistoryRow(
      db.prepare("SELECT * FROM ai_life_assistant_history WHERE id = ?").get(existing.id) as Record<
        string,
        unknown
      >,
    );
  }
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_life_assistant_history (
      id, workspace_id, event_title, event_description, occurred_at, event_kind, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.eventTitle,
    input.eventDescription,
    input.occurredAt,
    input.eventKind ?? "milestone",
    now,
  );
  return mapAssistantHistoryRow(
    db.prepare("SELECT * FROM ai_life_assistant_history WHERE id = ?").get(id) as Record<string, unknown>,
  );
}

function upsertInterest(
  db: Database.Database,
  input: {
    workspaceId: string;
    interest: string;
    lastReferencedAt: string;
    confidenceScore: number;
  },
): RecurringInterest {
  const key = uniqueKey(input.interest);
  const existing = db
    .prepare("SELECT id, mention_count FROM ai_life_interests WHERE workspace_id = ? AND lower(interest) = ?")
    .get(input.workspaceId, key) as { id: string; mention_count: number } | undefined;
  const now = new Date().toISOString();
  const id = existing?.id ?? uuid();
  const mentionCount = (existing?.mention_count ?? 0) + 1;
  if (existing) {
    db.prepare(
      `UPDATE ai_life_interests SET mention_count = ?, confidence_score = ?, last_referenced_at = ?, updated_at = ? WHERE id = ?`,
    ).run(mentionCount, input.confidenceScore, input.lastReferencedAt, now, id);
  } else {
    db.prepare(
      `INSERT INTO ai_life_interests (
        id, workspace_id, interest, mention_count, confidence_score, last_referenced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.workspaceId, input.interest, 1, input.confidenceScore, input.lastReferencedAt, now, now);
  }
  return mapInterestRow(
    db.prepare("SELECT * FROM ai_life_interests WHERE id = ?").get(id) as Record<string, unknown>,
  );
}

function extractGoalFromSentence(sentence: string): string | null {
  if (!GOAL_RE.test(sentence)) return null;
  const cleaned = sentence
    .replace(/^(my goal is|goal:|objective is)\s*/i, "")
    .trim();
  return truncate(cleaned || sentence, 200);
}

function extractProjectFromSentence(sentence: string): { name: string; objective: string } | null {
  if (!PROJECT_RE.test(sentence) && !/^[A-Z][\w]+(?:OS|Coach|App)\b/.test(sentence)) return null;
  const nameMatch = sentence.match(/\b(?:build|launch|working on|building|developing)\s+([A-Z][\w-]+)/i);
  const name = nameMatch?.[1] ?? truncate(sentence, 48);
  return { name, objective: truncate(sentence, 240) };
}

export function extractLongTermGoals(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): LongTermGoal[] {
  const ws = db
    .prepare("SELECT name, continuity_summary FROM workspaces WHERE id = ?")
    .get(workspaceId) as { name: string; continuity_summary: string | null } | undefined;
  if (ws?.continuity_summary?.trim()) {
    upsertGoal(db, {
      workspaceId,
      threadId: threadId ?? null,
      sourceMessageId: null,
      goal: truncate(ws.continuity_summary, 200),
      confidenceScore: 0.82,
      lastReferencedAt: new Date().toISOString(),
    });
  }

  const threads = threadId
    ? [{ id: threadId }]
    : (db.prepare("SELECT id FROM threads WHERE workspace_id = ?").all(workspaceId) as Array<{ id: string }>);

  for (const thread of threads) {
    const state = getMemoryState(db, workspaceId, thread.id);
    for (const goal of state?.currentGoals ?? []) {
      if (!isOperationalContent(goal)) continue;
      upsertGoal(db, {
        workspaceId,
        threadId: thread.id,
        sourceMessageId: null,
        goal,
        confidenceScore: 0.74,
        lastReferencedAt: new Date().toISOString(),
      });
    }

    const messages = db
      .prepare(
        `SELECT id, role, content, created_at FROM messages
         WHERE thread_id = ? AND role = 'user'
         ORDER BY created_at DESC LIMIT 400`,
      )
      .all(thread.id) as Array<{ id: string; role: MessageRole; content: string; created_at: string }>;

    for (const message of messages) {
      for (const sentence of sentenceCandidates(message.content)) {
        const goal = extractGoalFromSentence(sentence);
        if (!goal) continue;
        upsertGoal(db, {
          workspaceId,
          threadId: thread.id,
          sourceMessageId: message.id,
          goal,
          confidenceScore: 0.7,
          lastReferencedAt: message.created_at,
        });
      }
    }
  }

  const rows = db
    .prepare(
      "SELECT * FROM ai_life_goals WHERE workspace_id = ? ORDER BY last_referenced_at DESC LIMIT 40",
    )
    .all(workspaceId) as Array<Record<string, unknown>>;
  return rows.map(mapGoalRow);
}

export function extractActiveProjects(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): ActiveProject[] {
  const ws = db
    .prepare("SELECT name, continuity_summary FROM workspaces WHERE id = ?")
    .get(workspaceId) as { name: string; continuity_summary: string | null } | undefined;
  if (ws) {
    upsertProject(db, {
      workspaceId,
      threadId: threadId ?? null,
      sourceMessageId: null,
      projectName: ws.name,
      currentObjective: ws.continuity_summary?.trim() || `Active workspace: ${ws.name}`,
      lastActivityAt: new Date().toISOString(),
      continuityConfidence: 0.75,
      status: "active",
    });
  }

  const threads = threadId
    ? [{ id: threadId }]
    : (db.prepare("SELECT id FROM threads WHERE workspace_id = ?").all(workspaceId) as Array<{ id: string }>);

  for (const thread of threads) {
    const messages = db
      .prepare(
        `SELECT id, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 300`,
      )
      .all(thread.id) as Array<{ id: string; content: string; created_at: string }>;

    for (const message of messages) {
      for (const sentence of sentenceCandidates(message.content)) {
        const project = extractProjectFromSentence(sentence);
        if (!project) continue;
        upsertProject(db, {
          workspaceId,
          threadId: thread.id,
          sourceMessageId: message.id,
          projectName: project.name,
          currentObjective: project.objective,
          lastActivityAt: message.created_at,
          continuityConfidence: 0.68,
          status: COMPLETED_RE.test(sentence) ? "completed" : "active",
        });
      }
    }
  }

  const rows = db
    .prepare(
      "SELECT * FROM ai_life_projects WHERE workspace_id = ? AND status IN ('active', 'paused') ORDER BY last_activity_at DESC",
    )
    .all(workspaceId) as Array<Record<string, unknown>>;
  return rows.map(mapProjectRow);
}

export function extractCompletedProjects(
  db: Database.Database,
  workspaceId: string,
  threadId?: string,
): ProjectAchievement[] {
  const decisions = extractProjectDecisions(db, workspaceId, threadId);
  for (const decision of decisions) {
    if (!COMPLETED_RE.test(decision.description) && !MILESTONE_COMPLETED(decision.description)) continue;
    const projectName =
      decision.title.match(/[A-Z][\w-]+/)?.[0] ?? truncate(decision.title, 48);
    insertAchievement(db, {
      workspaceId,
      threadId: decision.threadId,
      sourceMessageId: decision.sourceMessageId,
      projectName,
      achievement: decision.description,
      completedAt: `${decision.decidedAt}-01T00:00:00.000Z`,
      confidenceScore: decision.scores.confidenceScore,
    });
    upsertProject(db, {
      workspaceId,
      threadId: decision.threadId,
      sourceMessageId: decision.sourceMessageId,
      projectName,
      currentObjective: decision.description,
      lastActivityAt: `${decision.decidedAt}-01T00:00:00.000Z`,
      continuityConfidence: decision.scores.continuityScore,
      status: "completed",
    });
  }

  const threads = threadId
    ? [{ id: threadId }]
    : (db.prepare("SELECT id FROM threads WHERE workspace_id = ?").all(workspaceId) as Array<{ id: string }>);

  for (const thread of threads) {
    const messages = db
      .prepare(
        `SELECT id, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT 300`,
      )
      .all(thread.id) as Array<{ id: string; content: string; created_at: string }>;
    for (const message of messages) {
      for (const sentence of sentenceCandidates(message.content)) {
        if (!COMPLETED_RE.test(sentence)) continue;
        const project = extractProjectFromSentence(sentence) ?? {
          name: "Project",
          objective: sentence,
        };
        insertAchievement(db, {
          workspaceId,
          threadId: thread.id,
          sourceMessageId: message.id,
          projectName: project.name,
          achievement: sentence,
          completedAt: message.created_at,
          confidenceScore: 0.65,
        });
      }
    }
  }

  const rows = db
    .prepare("SELECT * FROM ai_life_achievements WHERE workspace_id = ? ORDER BY completed_at DESC LIMIT 40")
    .all(workspaceId) as Array<Record<string, unknown>>;
  return rows.map(mapAchievementRow);
}

function MILESTONE_COMPLETED(text: string): boolean {
  return /\b(completed|shipped|added|implemented|finished|released)\b/i.test(text);
}

export function extractRecurringInterests(
  db: Database.Database,
  workspaceId: string,
): RecurringInterest[] {
  const stateThreads = db
    .prepare("SELECT id FROM threads WHERE workspace_id = ?")
    .all(workspaceId) as Array<{ id: string }>;

  for (const thread of stateThreads) {
    const state = getMemoryState(db, workspaceId, thread.id);
    for (const pref of state?.userPreferences ?? []) {
      if (!isOperationalContent(pref) || !INTEREST_RE.test(pref)) continue;
      upsertInterest(db, {
        workspaceId,
        interest: truncate(pref, 160),
        lastReferencedAt: new Date().toISOString(),
        confidenceScore: 0.62,
      });
    }
  }

  const messages = db
    .prepare(
      `SELECT m.content, m.created_at FROM messages m
       JOIN threads t ON t.id = m.thread_id
       WHERE t.workspace_id = ? AND m.role = 'user'
       ORDER BY m.created_at DESC LIMIT 500`,
    )
    .all(workspaceId) as Array<{ content: string; created_at: string }>;

  for (const message of messages) {
    for (const sentence of sentenceCandidates(message.content)) {
      if (!INTEREST_RE.test(sentence)) continue;
      const topic = truncate(sentence.replace(/^(interested in|focus on|learning|exploring)\s*/i, ""), 120);
      if (topic.length < 6) continue;
      upsertInterest(db, {
        workspaceId,
        interest: topic,
        lastReferencedAt: message.created_at,
        confidenceScore: 0.58,
      });
    }
  }

  const rows = db
    .prepare(
      "SELECT * FROM ai_life_interests WHERE workspace_id = ? AND mention_count >= 2 ORDER BY mention_count DESC LIMIT 24",
    )
    .all(workspaceId) as Array<Record<string, unknown>>;
  return rows.map(mapInterestRow);
}

export function extractAssistantHistory(
  db: Database.Database,
  workspaceId: string,
): AssistantHistoryEntry[] {
  const profile = getAssistantProfile(db);
  recordAssistantHistoryEvent(db, {
    workspaceId,
    eventTitle: "Assistant Created",
    eventDescription: `Assistant "${profile.assistantName}" initialized.`,
    occurredAt: profile.assistantCreatedAt,
    eventKind: "created",
  });

  const decisions = extractProjectDecisions(db, workspaceId);
  for (const decision of decisions) {
    for (const milestone of KNOWN_ASSISTANT_MILESTONES) {
      if (!milestone.match.test(decision.description) && !milestone.match.test(decision.title)) continue;
      recordAssistantHistoryEvent(db, {
        workspaceId,
        eventTitle: milestone.title,
        eventDescription: milestone.description,
        occurredAt: `${decision.decidedAt}-01T00:00:00.000Z`,
        eventKind: "capability",
      });
    }
    if (/renamed assistant|assistant name|named assistant/i.test(decision.description)) {
      recordAssistantHistoryEvent(db, {
        workspaceId,
        eventTitle: "User Renamed Assistant",
        eventDescription: decision.description,
        occurredAt: `${decision.decidedAt}-01T00:00:00.000Z`,
        eventKind: "renamed",
      });
    }
  }

  const timeline = generateProjectTimeline(db, workspaceId);
  for (const event of timeline) {
    if (!/assistant|identity|provider|continuity intelligence|ai life/i.test(event.title + event.description)) {
      continue;
    }
    recordAssistantHistoryEvent(db, {
      workspaceId,
      eventTitle: event.title,
      eventDescription: event.description,
      occurredAt: event.occurredAt,
      eventKind: "milestone",
    });
  }

  const rows = db
    .prepare(
      "SELECT * FROM ai_life_assistant_history WHERE workspace_id = ? ORDER BY occurred_at ASC LIMIT 60",
    )
    .all(workspaceId) as Array<Record<string, unknown>>;
  return rows.map(mapAssistantHistoryRow);
}

export function calculateAiLifeHealth(
  db: Database.Database,
  workspaceId: string,
): AiLifeHealthMetrics {
  const goals = extractLongTermGoals(db, workspaceId);
  const projects = extractActiveProjects(db, workspaceId);
  const achievements = extractCompletedProjects(db, workspaceId);
  const history = extractAssistantHistory(db, workspaceId);
  const continuityHealth = calculateContinuityHealthMetrics(db, workspaceId);

  const messageCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages m JOIN threads t ON t.id = m.thread_id WHERE t.workspace_id = ?`,
      )
      .get(workspaceId) as { c: number }
  ).c;

  const aiLifeCoverage = Math.min(1, (goals.length + projects.length + achievements.length) / Math.max(5, messageCount / 30));
  const goalCoverage = Math.min(1, goals.filter((g) => g.status === "active").length / Math.max(2, goals.length));
  const projectCoverage = Math.min(1, projects.length / Math.max(1, projects.length + achievements.length));
  const assistantHistoryCoverage = Math.min(1, history.length / 5);

  return {
    aiLifeCoverage: Number(aiLifeCoverage.toFixed(3)),
    goalCoverage: Number(goalCoverage.toFixed(3)),
    projectCoverage: Number(projectCoverage.toFixed(3)),
    rebuildConfidence: continuityHealth.rebuildConfidence,
    assistantHistoryCoverage: Number(assistantHistoryCoverage.toFixed(3)),
  };
}

function persistAiLifeHealthMetrics(db: Database.Database, workspaceId: string, metrics: AiLifeHealthMetrics): void {
  db.prepare(
    `INSERT INTO ai_life_health_metrics (
      id, workspace_id, ai_life_coverage, goal_coverage, project_coverage,
      rebuild_confidence, assistant_history_coverage, metrics_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    workspaceId,
    metrics.aiLifeCoverage,
    metrics.goalCoverage,
    metrics.projectCoverage,
    metrics.rebuildConfidence,
    metrics.assistantHistoryCoverage,
    JSON.stringify(metrics),
    new Date().toISOString(),
  );
}

function buildSnapshotMarkdown(snapshot: Omit<AiLifeSnapshot, "markdown">): string {
  const lines = [
    "# AI Life Snapshot",
    "",
    `Workspace: ${snapshot.workspaceName}`,
    `Generated: ${snapshot.generatedAt}`,
    `AI Life score: ${Math.round(snapshot.aiLifeScore * 100)}%`,
    "",
    "## Current Goals",
    ...(snapshot.currentGoals.length ? snapshot.currentGoals.map((g) => `- ${g}`) : ["- None recorded yet."]),
    "",
    "## Active Projects",
    ...(snapshot.activeProjects.length ? snapshot.activeProjects.map((p) => `- ${p}`) : ["- None recorded yet."]),
    "",
    "## Completed Projects",
    ...(snapshot.completedProjects.length
      ? snapshot.completedProjects.map((p) => `- ${p}`)
      : ["- None recorded yet."]),
    "",
    "## Recent Progress",
    ...(snapshot.recentProgress.length ? snapshot.recentProgress.map((p) => `- ${p}`) : ["- None recorded yet."]),
    "",
    "## Open Questions",
    ...(snapshot.openQuestions.length ? snapshot.openQuestions.map((q) => `- ${q}`) : ["- None recorded yet."]),
    "",
    "## Assistant History",
    ...(snapshot.assistantHistory.length
      ? snapshot.assistantHistory.map((h) => `- ${h}`)
      : ["- None recorded yet."]),
    "",
    "## Current Priorities",
    ...(snapshot.currentPriorities.length
      ? snapshot.currentPriorities.map((p) => `- ${p}`)
      : ["- Continue active projects from conversation truth."]),
  ];
  return lines.join("\n");
}

export function generateAiLifeSummary(db: Database.Database, workspaceId: string): AiLifeSnapshot {
  return generateAiLifeSnapshot(db, workspaceId);
}

export function generateAiLifeSnapshot(db: Database.Database, workspaceId: string): AiLifeSnapshot {
  const ws = db
    .prepare("SELECT id, name FROM workspaces WHERE id = ?")
    .get(workspaceId) as { id: string; name: string } | undefined;
  if (!ws) throw new Error("Workspace not found.");

  const goals = extractLongTermGoals(db, workspaceId);
  const activeProjects = extractActiveProjects(db, workspaceId);
  const completed = extractCompletedProjects(db, workspaceId);
  const history = extractAssistantHistory(db, workspaceId);
  const openQuestions = extractOpenQuestions(db, workspaceId);
  const health = calculateAiLifeHealth(db, workspaceId);
  const timeline = generateProjectTimeline(db, workspaceId);
  const generatedAt = new Date().toISOString();
  const aiLifeScore = Number(
    Math.min(
      0.99,
      health.aiLifeCoverage * 0.35 +
        health.goalCoverage * 0.2 +
        health.projectCoverage * 0.2 +
        health.rebuildConfidence * 0.15 +
        health.assistantHistoryCoverage * 0.1,
    ).toFixed(3),
  );

  const body: Omit<AiLifeSnapshot, "markdown"> = {
    workspaceId,
    workspaceName: ws.name,
    generatedAt,
    aiLifeScore,
    currentGoals: goals.filter((g) => g.status === "active").slice(0, 8).map((g) => g.goal),
    activeProjects: activeProjects.slice(0, 8).map((p) => `${p.projectName}: ${p.currentObjective}`),
    completedProjects: completed.slice(0, 8).map((a) => `${a.projectName}: ${a.achievement}`),
    recentProgress: timeline.slice(-6).map((e) => e.title),
    openQuestions: openQuestions
      .filter((q) => q.status === "open")
      .slice(0, 8)
      .map((q) => q.question),
    assistantHistory: history.slice(-8).map((h) => `${h.eventTitle} — ${h.eventDescription}`),
    currentPriorities: [
      ...goals.filter((g) => g.status === "active").slice(0, 3).map((g) => g.goal),
      ...activeProjects.slice(0, 2).map((p) => p.projectName),
    ].slice(0, 5),
  };

  const snapshot: AiLifeSnapshot = { ...body, markdown: buildSnapshotMarkdown(body) };

  db.prepare(
    `INSERT INTO ai_life_snapshots (id, workspace_id, snapshot_json, snapshot_markdown, ai_life_score, generated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(uuid(), workspaceId, JSON.stringify(body), snapshot.markdown, aiLifeScore, generatedAt);

  persistAiLifeHealthMetrics(db, workspaceId, health);
  return snapshot;
}

export function analyzeAiLife(db: Database.Database, workspaceId: string): AiLifeAnalysis {
  const goals = extractLongTermGoals(db, workspaceId);
  const activeProjects = extractActiveProjects(db, workspaceId);
  const completedProjects = extractCompletedProjects(db, workspaceId);
  const recurringInterests = extractRecurringInterests(db, workspaceId);
  const assistantHistory = extractAssistantHistory(db, workspaceId);
  const openQuestions = extractOpenQuestions(db, workspaceId);
  const health = calculateAiLifeHealth(db, workspaceId);
  persistAiLifeHealthMetrics(db, workspaceId, health);
  const aiLifeScore = Number(
    Math.min(0.99, health.aiLifeCoverage * 0.4 + health.rebuildConfidence * 0.35 + health.goalCoverage * 0.25).toFixed(
      3,
    ),
  );
  return {
    goals,
    activeProjects,
    completedProjects,
    recurringInterests,
    assistantHistory,
    openQuestions,
    health,
    aiLifeScore,
  };
}

export function incrementalAiLifeFromMessage(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    messageId: string;
    role: MessageRole;
    content: string;
    createdAt: string;
  },
): void {
  if (input.role !== "user") return;
  try {
    for (const sentence of sentenceCandidates(input.content)) {
      const goal = extractGoalFromSentence(sentence);
      if (goal) {
        upsertGoal(db, {
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          sourceMessageId: input.messageId,
          goal,
          confidenceScore: 0.66,
          lastReferencedAt: input.createdAt,
        });
      }
      const project = extractProjectFromSentence(sentence);
      if (project) {
        upsertProject(db, {
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          sourceMessageId: input.messageId,
          projectName: project.name,
          currentObjective: project.objective,
          lastActivityAt: input.createdAt,
          continuityConfidence: 0.64,
          status: COMPLETED_RE.test(sentence) ? "completed" : "active",
        });
      }
      if (COMPLETED_RE.test(sentence)) {
        const p = project ?? { name: "Project", objective: sentence };
        insertAchievement(db, {
          workspaceId: input.workspaceId,
          threadId: input.threadId,
          sourceMessageId: input.messageId,
          projectName: p.name,
          achievement: sentence,
          completedAt: input.createdAt,
          confidenceScore: 0.6,
        });
      }
      if (INTEREST_RE.test(sentence)) {
        const topic = truncate(sentence.replace(/^(interested in|focus on|learning|exploring)\s*/i, ""), 120);
        if (topic.length >= 6) {
          upsertInterest(db, {
            workspaceId: input.workspaceId,
            interest: topic,
            lastReferencedAt: input.createdAt,
            confidenceScore: 0.55,
          });
        }
      }
    }
  } catch (error) {
    console.warn("[continuity] incremental AI Life skipped", error);
  }
}

export function rebuildAiLifeFromHistory(
  db: Database.Database,
  workspaceId: string,
): {
  rebuiltGoals: number;
  rebuiltProjects: number;
  rebuiltAchievements: number;
  rebuiltHistory: number;
  aiLifeScore: number;
} {
  db.prepare("DELETE FROM ai_life_goals WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_projects WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_achievements WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_assistant_history WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_interests WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_snapshots WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_health_metrics WHERE workspace_id = ?").run(workspaceId);

  rebuildIntelligenceFromHistory(db, workspaceId);

  const analysis = analyzeAiLife(db, workspaceId);
  return {
    rebuiltGoals: analysis.goals.length,
    rebuiltProjects: analysis.activeProjects.length,
    rebuiltAchievements: analysis.completedProjects.length,
    rebuiltHistory: analysis.assistantHistory.length,
    aiLifeScore: analysis.aiLifeScore,
  };
}

export function simulateAiLifeLossAndRebuild(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): {
  beforeScore: number;
  afterLossScore: number;
  afterRebuildScore: number;
  goalsRecovered: number;
  projectsRecovered: number;
  rebuildSuccessful: boolean;
} {
  analyzeAiLife(db, workspaceId);
  const before = calculateAiLifeHealth(db, workspaceId);

  db.prepare("DELETE FROM ai_life_goals WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_projects WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_achievements WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_assistant_history WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM ai_life_interests WHERE workspace_id = ?").run(workspaceId);

  const afterLoss = calculateAiLifeHealth(db, workspaceId);
  const rebuilt = rebuildAiLifeFromHistory(db, workspaceId);
  const afterRebuild = calculateAiLifeHealth(db, workspaceId);

  return {
    beforeScore: before.aiLifeCoverage,
    afterLossScore: afterLoss.aiLifeCoverage,
    afterRebuildScore: afterRebuild.aiLifeCoverage,
    goalsRecovered: rebuilt.rebuiltGoals,
    projectsRecovered: rebuilt.rebuiltProjects,
    rebuildSuccessful: rebuilt.rebuiltGoals > 0 || rebuilt.rebuiltProjects > 0,
  };
}

export function runAiLifeScaleSimulation(
  db: Database.Database,
  input: { workspaceId: string; threadId: string; messageCount: number; label: string },
): {
  messageCount: number;
  rebuildSuccess: boolean;
  goalsRetained: number;
  projectsRetained: number;
  timelineRetained: number;
  aiLifeScore: number;
} {
  const insert = db.prepare(
    `INSERT INTO messages (id, thread_id, role, content, message_status, created_at)
     VALUES (?, ?, 'user', ?, 'completed', ?)`,
  );
  const insertBatch = db.transaction((start: number, end: number) => {
    for (let i = start; i < end; i += 1) {
      const content =
        i % 19 === 0
          ? `My goal is to ${input.label} initiative ${i} with long-term continuity.`
          : i % 23 === 0
            ? `Working on ${input.label}Project${i % 50} — major initiative for operational continuity.`
            : i % 29 === 0
              ? `Completed and shipped ${input.label} milestone ${i}.`
              : `${input.label} message ${i}: AI Life scale simulation payload.`;
      insert.run(uuid(), input.threadId, content, new Date(Date.now() + i * 1000).toISOString());
    }
  });
  for (let start = 0; start < input.messageCount; start += 1000) {
    insertBatch(start, Math.min(input.messageCount, start + 1000));
  }

  db.prepare("DELETE FROM ai_life_goals WHERE workspace_id = ?").run(input.workspaceId);
  db.prepare("DELETE FROM ai_life_projects WHERE workspace_id = ?").run(input.workspaceId);
  db.prepare("DELETE FROM ai_life_achievements WHERE workspace_id = ?").run(input.workspaceId);
  db.prepare("DELETE FROM ai_life_assistant_history WHERE workspace_id = ?").run(input.workspaceId);
  db.prepare("DELETE FROM ai_life_interests WHERE workspace_id = ?").run(input.workspaceId);

  if (input.messageCount <= 2500) {
    rebuildIntelligenceFromHistory(db, input.workspaceId);
  }

  const analysis = analyzeAiLife(db, input.workspaceId);
  const timeline = generateProjectTimeline(db, input.workspaceId);
  return {
    messageCount: input.messageCount,
    rebuildSuccess: analysis.goals.length > 0 || analysis.activeProjects.length > 0,
    goalsRetained: analysis.goals.length,
    projectsRetained: analysis.activeProjects.length,
    timelineRetained: timeline.length,
    aiLifeScore: analysis.aiLifeScore,
  };
}

export function buildAiLifeExport(db: Database.Database, workspaceId: string): AiLifeExport {
  const goals = extractLongTermGoals(db, workspaceId);
  const projects = db
    .prepare("SELECT * FROM ai_life_projects WHERE workspace_id = ?")
    .all(workspaceId) as Array<Record<string, unknown>>;
  const achievements = extractCompletedProjects(db, workspaceId);
  const interests = extractRecurringInterests(db, workspaceId);
  const assistantHistory = extractAssistantHistory(db, workspaceId);
  const health = calculateAiLifeHealth(db, workspaceId);

  let latestSnapshot: AiLifeSnapshot | null = null;
  const row = db
    .prepare("SELECT snapshot_json FROM ai_life_snapshots WHERE workspace_id = ? ORDER BY generated_at DESC LIMIT 1")
    .get(workspaceId) as { snapshot_json: string } | undefined;
  if (row) {
    try {
      const parsed = JSON.parse(row.snapshot_json) as Omit<AiLifeSnapshot, "markdown">;
      latestSnapshot = { ...parsed, markdown: buildSnapshotMarkdown(parsed) };
    } catch {
      latestSnapshot = null;
    }
  }

  return {
    version: 1,
    goals,
    projects: projects.map(mapProjectRow),
    achievements,
    interests,
    assistantHistory,
    latestSnapshot,
    health,
  };
}

export function importAiLifeExport(db: Database.Database, workspaceId: string, payload: AiLifeExport): void {
  if (!payload || payload.version !== 1) return;
  for (const goal of payload.goals ?? []) {
    upsertGoal(db, {
      workspaceId,
      threadId: goal.threadId,
      sourceMessageId: goal.sourceMessageId,
      goal: goal.goal,
      status: goal.status,
      confidenceScore: goal.confidenceScore,
      lastReferencedAt: goal.lastReferencedAt,
    });
  }
  for (const project of payload.projects ?? []) {
    upsertProject(db, {
      workspaceId,
      threadId: project.threadId,
      sourceMessageId: project.sourceMessageId,
      projectName: project.projectName,
      currentObjective: project.currentObjective,
      lastActivityAt: project.lastActivityAt,
      continuityConfidence: project.continuityConfidence,
      status: project.status,
    });
  }
  for (const achievement of payload.achievements ?? []) {
    insertAchievement(db, {
      workspaceId,
      threadId: achievement.threadId,
      sourceMessageId: achievement.sourceMessageId,
      projectName: achievement.projectName,
      achievement: achievement.achievement,
      completedAt: achievement.completedAt,
      confidenceScore: achievement.confidenceScore,
    });
  }
  for (const entry of payload.assistantHistory ?? []) {
    recordAssistantHistoryEvent(db, {
      workspaceId,
      eventTitle: entry.eventTitle,
      eventDescription: entry.eventDescription,
      occurredAt: entry.occurredAt,
      eventKind: entry.eventKind,
    });
  }
  if (payload.health) persistAiLifeHealthMetrics(db, workspaceId, payload.health);
}
