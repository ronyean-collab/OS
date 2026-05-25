import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type {
  ContinuityImportApplyResult,
  ContinuityImportMode,
  ContinuityImportPreview,
  Workspace,
} from "../../../src/shared/types";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import { MAX_CONTINUITY_SUMMARY_CHARS } from "./context-assembly";
import { getWorkspaceById } from "./workspace-service";

const IMPORT_HEADER = "# CONTINUITYOS IMPORT FILE";
const SUPPORTED_IMPORT_VERSION = 1;
const APPLIED_RECORD_TYPE = "continuity_import_file_applied_v1";
const CHECKPOINT_RECORD_TYPE = "continuity_import_file_checkpoint_v1";

type ParsedContinuityImport = ContinuityImportPreview & {
  rawSource: string;
};

type StoredContinuityImportRecord = ParsedContinuityImport & {
  appliedAt: string;
  mode: ContinuityImportMode;
};

type ListSectionKey =
  | "stableFacts"
  | "recentProgress"
  | "decisionsMade"
  | "openIssues"
  | "nextSteps"
  | "testBuildGitStatus"
  | "risksWarnings"
  | "rulesForFutureAi";

type TextSectionKey =
  | "currentObjective"
  | "continuitySummary"
  | "importantContextForNextAi"
  | "recentConversationExcerpts";

const TEXT_SECTIONS: Record<string, TextSectionKey> = {
  "CURRENT OBJECTIVE": "currentObjective",
  "CONTINUITY SUMMARY": "continuitySummary",
  "IMPORTANT CONTEXT FOR NEXT AI": "importantContextForNextAi",
  "RECENT CONVERSATION EXCERPTS": "recentConversationExcerpts",
};

const LIST_SECTIONS: Record<string, ListSectionKey> = {
  "STABLE FACTS": "stableFacts",
  "RECENT PROGRESS": "recentProgress",
  "DECISIONS MADE": "decisionsMade",
  "OPEN ISSUES": "openIssues",
  "NEXT STEPS": "nextSteps",
  "TEST / BUILD / GIT STATUS": "testBuildGitStatus",
  "RISKS / WARNINGS": "risksWarnings",
  "RULES FOR FUTURE AI": "rulesForFutureAi",
};

function normalizeImportText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeUnknown(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "UNKNOWN";
}

function hasKnownValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.toUpperCase() !== "UNKNOWN";
}

function limitString(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

function normalizeList(lines: string[]): string[] {
  const items: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);
    const numberedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    const nextChunk = bulletMatch?.[1] ?? numberedMatch?.[1] ?? trimmed;

    if (bulletMatch || numberedMatch) {
      if (current) {
        items.push(limitString(collapseWhitespace(current), 280));
      }
      current = nextChunk;
      continue;
    }

    current = current ? `${current} ${nextChunk}` : nextChunk;
  }

  if (current) {
    items.push(limitString(collapseWhitespace(current), 280));
  }

  return items.filter(Boolean);
}

function normalizeTextSection(lines: string[]): string {
  return normalizeUnknown(lines.join("\n").trim());
}

function buildEmptyPreview(rawSource = ""): ParsedContinuityImport {
  return {
    valid: false,
    version: null,
    sourceAi: "UNKNOWN",
    generatedAt: "UNKNOWN",
    projectName: "UNKNOWN",
    projectType: "UNKNOWN",
    currentObjective: "UNKNOWN",
    continuitySummary: "UNKNOWN",
    stableFacts: [],
    recentProgress: [],
    decisionsMade: [],
    openIssues: [],
    nextSteps: [],
    importantContextForNextAi: "UNKNOWN",
    recentConversationExcerpts: "UNKNOWN",
    testBuildGitStatus: [],
    risksWarnings: [],
    rulesForFutureAi: [],
    warnings: [],
    errors: [],
    rawSource,
  };
}

export function previewContinuityImportFile(raw: string): ContinuityImportPreview {
  return parseContinuityImportFile(raw);
}

export function parseContinuityImportFile(raw: string): ParsedContinuityImport {
  const normalized = normalizeImportText(raw);
  const preview = buildEmptyPreview(normalized);

  if (!normalized) {
    preview.errors.push("Import file is empty.");
    return preview;
  }

  const lines = normalized.split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  const firstNonEmptyLine = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex].trim() : "";
  if (firstNonEmptyLine.toUpperCase() !== IMPORT_HEADER) {
    preview.errors.push("Missing `# CONTINUITYOS IMPORT FILE` header.");
    return preview;
  }

  const metadata = new Map<string, string>();
  const sectionBuffers = new Map<string, string[]>();
  let activeSection: string | null = null;

  for (const line of lines.slice(firstNonEmptyIndex + 1)) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      activeSection = trimmed.slice(3).trim().toUpperCase();
      sectionBuffers.set(activeSection, []);
      continue;
    }

    if (!activeSection) {
      const metadataMatch = /^([a-z_]+)\s*:\s*(.*)$/i.exec(trimmed);
      if (metadataMatch) {
        metadata.set(metadataMatch[1].toLowerCase(), metadataMatch[2].trim());
      }
      continue;
    }

    sectionBuffers.get(activeSection)?.push(line);
  }

  const versionRaw = metadata.get("version") ?? "";
  if (!versionRaw) {
    preview.warnings.push("Missing version. Assuming version 1.");
    preview.version = SUPPORTED_IMPORT_VERSION;
  } else {
    const version = Number.parseInt(versionRaw, 10);
    if (Number.isNaN(version)) {
      preview.errors.push("Version must be a number.");
    } else {
      preview.version = version;
      if (version !== SUPPORTED_IMPORT_VERSION) {
        preview.errors.push(`Unsupported version ${version}.`);
      }
    }
  }

  preview.sourceAi = normalizeUnknown(metadata.get("source_ai"));
  preview.generatedAt = normalizeUnknown(metadata.get("generated_at"));
  preview.projectName = normalizeUnknown(metadata.get("project_name"));
  preview.projectType = normalizeUnknown(metadata.get("project_type"));

  for (const [heading, key] of Object.entries(TEXT_SECTIONS)) {
    preview[key] = normalizeTextSection(sectionBuffers.get(heading) ?? []);
  }

  for (const [heading, key] of Object.entries(LIST_SECTIONS)) {
    preview[key] = normalizeList(sectionBuffers.get(heading) ?? []);
  }

  if (!hasKnownValue(preview.currentObjective) && !hasKnownValue(preview.continuitySummary)) {
    preview.warnings.push(
      "The import file is missing both a current objective and a continuity summary.",
    );
  }

  preview.valid = preview.errors.length === 0;
  return preview;
}

function truncateList(items: string[], limit = 6): string[] {
  return items.slice(0, limit).map((item) => limitString(item, 240));
}

function buildImportedSummaryBlock(parsed: ParsedContinuityImport): string {
  const blocks: string[] = [];
  if (hasKnownValue(parsed.currentObjective)) {
    blocks.push(`Current objective: ${limitString(parsed.currentObjective, 400)}`);
  }
  if (hasKnownValue(parsed.continuitySummary)) {
    blocks.push(limitString(parsed.continuitySummary, 1500));
  }
  if (parsed.nextSteps.length > 0) {
    blocks.push(`Next steps: ${truncateList(parsed.nextSteps, 4).join("; ")}`);
  }
  if (parsed.openIssues.length > 0) {
    blocks.push(`Open issues: ${truncateList(parsed.openIssues, 4).join("; ")}`);
  }
  return blocks.join("\n\n").trim();
}

function mergeContinuitySummary(
  existingSummary: string | null,
  parsed: ParsedContinuityImport,
  mode: ContinuityImportMode,
): string | null {
  const importedSummary = buildImportedSummaryBlock(parsed);
  if (!importedSummary) {
    return existingSummary?.trim() ? existingSummary.trim() : null;
  }

  if (mode === "create-workspace" || !existingSummary?.trim()) {
    return importedSummary.slice(0, MAX_CONTINUITY_SUMMARY_CHARS);
  }

  const importedHeader = `Imported AI chat state (${parsed.sourceAi}${
    hasKnownValue(parsed.generatedAt) ? `, ${parsed.generatedAt}` : ""
  }):`;
  const merged = `${existingSummary.trim()}\n\n${importedHeader}\n${importedSummary}`;
  return merged.slice(0, MAX_CONTINUITY_SUMMARY_CHARS);
}

function createWorkspaceFromImport(
  db: Database.Database,
  parsed: ParsedContinuityImport,
  summary: string | null,
): Workspace {
  const id = uuid();
  const now = new Date().toISOString();
  const name = hasKnownValue(parsed.projectName) ? parsed.projectName : "Imported AI chat state";
  db.prepare(
    `INSERT INTO workspaces (id, user_id, name, created_at, updated_at, last_opened_at, continuity_summary)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
  ).run(id, name, now, now, now, summary);

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    continuitySummary: summary,
  };
}

function insertContinuityImportRecord(
  db: Database.Database,
  workspaceId: string,
  parsed: ParsedContinuityImport,
  mode: ContinuityImportMode,
): void {
  const recordId = uuid();
  const appliedAt = new Date().toISOString();
  const recordType =
    mode === "checkpoint-only" ? CHECKPOINT_RECORD_TYPE : APPLIED_RECORD_TYPE;
  const payload: StoredContinuityImportRecord = {
    ...parsed,
    appliedAt,
    mode,
  };

  db.prepare(
    `INSERT INTO continuity_records (id, workspace_id, record_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(recordId, workspaceId, recordType, JSON.stringify(payload), appliedAt);
}

export function applyContinuityImportFile(
  db: Database.Database,
  input: {
    text: string;
    mode: ContinuityImportMode;
    workspaceId?: string | null;
  },
): ContinuityImportApplyResult {
  const parsed = parseContinuityImportFile(input.text);
  if (!parsed.valid) {
    return {
      ok: false,
      message: parsed.errors[0] ?? "Import file is not valid.",
      mode: input.mode,
      workspace: null,
      sourceAi: parsed.sourceAi,
      projectName: parsed.projectName,
    };
  }

  const mode = input.mode;
  if (mode !== "create-workspace" && !input.workspaceId?.trim()) {
    return {
      ok: false,
      message: "Select a workspace before applying this import file.",
      mode,
      workspace: null,
      sourceAi: parsed.sourceAi,
      projectName: parsed.projectName,
    };
  }

  const existingWorkspace =
    mode === "create-workspace" ? null : getWorkspaceById(db, input.workspaceId!.trim());
  if (mode !== "create-workspace" && !existingWorkspace) {
    return {
      ok: false,
      message: "Workspace not found.",
      mode,
      workspace: null,
      sourceAi: parsed.sourceAi,
      projectName: parsed.projectName,
    };
  }

  let workspace: Workspace | null = null;

  runInTransaction(db, () => {
    const mergedSummary =
      mode === "checkpoint-only"
        ? existingWorkspace?.continuitySummary ?? null
        : mergeContinuitySummary(existingWorkspace?.continuitySummary ?? null, parsed, mode);

    if (mode === "create-workspace") {
      workspace = createWorkspaceFromImport(db, parsed, mergedSummary);
    } else {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE workspaces SET continuity_summary = ?, updated_at = ? WHERE id = ?",
      ).run(mergedSummary, now, existingWorkspace!.id);
      workspace = getWorkspaceById(db, existingWorkspace!.id);
    }

    insertContinuityImportRecord(db, workspace!.id, parsed, mode);

    const counts = [
      parsed.stableFacts.length > 0 ? `${parsed.stableFacts.length} facts` : null,
      parsed.decisionsMade.length > 0 ? `${parsed.decisionsMade.length} decisions` : null,
      parsed.openIssues.length > 0 ? `${parsed.openIssues.length} open issues` : null,
      parsed.nextSteps.length > 0 ? `${parsed.nextSteps.length} next steps` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const modeLabel =
      mode === "create-workspace"
        ? "new workspace"
        : mode === "checkpoint-only"
          ? "checkpoint only"
          : "current workspace";

    appendTimelineEvent(db, {
      workspaceId: workspace!.id,
      type: "continuity_import_file_applied",
      title: "AI chat state imported",
      description: `Applied ${parsed.sourceAi} import file to ${modeLabel}${
        counts ? ` with ${counts}` : ""
      }.`,
      source: "user",
    });
  });

  const targetWorkspace =
    workspace ??
    (mode === "create-workspace"
      ? null
      : getWorkspaceById(db, input.workspaceId!.trim()));

  return {
    ok: true,
    message:
      mode === "checkpoint-only"
        ? "AI chat state saved as a checkpoint."
        : mode === "create-workspace"
          ? "AI chat state imported into a new workspace."
          : "AI chat state imported into the current workspace.",
    mode,
    workspace: targetWorkspace,
    sourceAi: parsed.sourceAi,
    projectName: parsed.projectName,
  };
}

function coerceStoredImport(value: unknown): ParsedContinuityImport | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const stableFacts = Array.isArray(record.stableFacts)
    ? record.stableFacts.map((item) => String(item))
    : [];
  const recentProgress = Array.isArray(record.recentProgress)
    ? record.recentProgress.map((item) => String(item))
    : [];
  const decisionsMade = Array.isArray(record.decisionsMade)
    ? record.decisionsMade.map((item) => String(item))
    : [];
  const openIssues = Array.isArray(record.openIssues)
    ? record.openIssues.map((item) => String(item))
    : [];
  const nextSteps = Array.isArray(record.nextSteps)
    ? record.nextSteps.map((item) => String(item))
    : [];
  const testBuildGitStatus = Array.isArray(record.testBuildGitStatus)
    ? record.testBuildGitStatus.map((item) => String(item))
    : [];
  const risksWarnings = Array.isArray(record.risksWarnings)
    ? record.risksWarnings.map((item) => String(item))
    : [];
  const rulesForFutureAi = Array.isArray(record.rulesForFutureAi)
    ? record.rulesForFutureAi.map((item) => String(item))
    : [];

  return {
    valid: true,
    version:
      typeof record.version === "number" ? record.version : SUPPORTED_IMPORT_VERSION,
    sourceAi: normalizeUnknown(String(record.sourceAi ?? "UNKNOWN")),
    generatedAt: normalizeUnknown(String(record.generatedAt ?? "UNKNOWN")),
    projectName: normalizeUnknown(String(record.projectName ?? "UNKNOWN")),
    projectType: normalizeUnknown(String(record.projectType ?? "UNKNOWN")),
    currentObjective: normalizeUnknown(String(record.currentObjective ?? "UNKNOWN")),
    continuitySummary: normalizeUnknown(String(record.continuitySummary ?? "UNKNOWN")),
    stableFacts,
    recentProgress,
    decisionsMade,
    openIssues,
    nextSteps,
    importantContextForNextAi: normalizeUnknown(
      String(record.importantContextForNextAi ?? "UNKNOWN"),
    ),
    recentConversationExcerpts: normalizeUnknown(
      String(record.recentConversationExcerpts ?? "UNKNOWN"),
    ),
    testBuildGitStatus,
    risksWarnings,
    rulesForFutureAi,
    warnings: [],
    errors: [],
    rawSource: String(record.rawSource ?? ""),
  };
}

export function getLatestAppliedContinuityImport(
  db: Database.Database,
  workspaceId: string,
): ParsedContinuityImport | null {
  const row = db
    .prepare(
      `SELECT payload_json
       FROM continuity_records
       WHERE workspace_id = ? AND record_type = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(workspaceId, APPLIED_RECORD_TYPE) as { payload_json: string } | undefined;

  if (!row?.payload_json) return null;
  try {
    return coerceStoredImport(JSON.parse(row.payload_json) as unknown);
  } catch {
    return null;
  }
}

function formatListBlock(title: string, items: string[], maxItems = 6): string[] {
  if (items.length === 0) return [];
  return [title, ...truncateList(items, maxItems).map((item) => `- ${item}`), ""];
}

export function buildImportedStateContextBlock(parsed: ParsedContinuityImport | null): string | null {
  if (!parsed) return null;

  const lines: string[] = [];
  if (hasKnownValue(parsed.projectName)) {
    lines.push(`Imported project: ${parsed.projectName}`);
  }
  if (hasKnownValue(parsed.projectType)) {
    lines.push(`Project type: ${parsed.projectType}`);
  }
  if (hasKnownValue(parsed.sourceAi)) {
    lines.push(`Source AI: ${parsed.sourceAi}`);
  }
  if (hasKnownValue(parsed.currentObjective)) {
    lines.push(`Current objective: ${limitString(parsed.currentObjective, 500)}`);
  }
  if (hasKnownValue(parsed.continuitySummary)) {
    lines.push(`Continuity summary:\n${limitString(parsed.continuitySummary, 1400)}`);
  }
  if (parsed.stableFacts.length > 0) {
    lines.push(`Stable facts: ${truncateList(parsed.stableFacts, 5).join("; ")}`);
  }
  if (parsed.decisionsMade.length > 0) {
    lines.push(`Decisions made: ${truncateList(parsed.decisionsMade, 5).join("; ")}`);
  }
  if (parsed.openIssues.length > 0) {
    lines.push(`Open issues: ${truncateList(parsed.openIssues, 5).join("; ")}`);
  }
  if (parsed.nextSteps.length > 0) {
    lines.push(`Next steps: ${truncateList(parsed.nextSteps, 5).join("; ")}`);
  }
  if (hasKnownValue(parsed.importantContextForNextAi)) {
    lines.push(
      `Important context for next AI:\n${limitString(parsed.importantContextForNextAi, 900)}`,
    );
  }

  const block = lines.join("\n\n").trim();
  return block || null;
}

export function buildImportedStateContextPackSections(
  parsed: ParsedContinuityImport | null,
): string[] {
  if (!parsed) return [];

  const sections: string[] = [
    "## Project State",
    `Source AI: ${parsed.sourceAi}`,
    `Project name: ${parsed.projectName}`,
    `Project type: ${parsed.projectType}`,
    `Generated at: ${parsed.generatedAt}`,
    `Current objective: ${parsed.currentObjective}`,
    "",
  ];

  sections.push(...formatListBlock("## Stable Facts", parsed.stableFacts));
  sections.push(...formatListBlock("## Decisions Made", parsed.decisionsMade));
  sections.push(...formatListBlock("## Open Issues", parsed.openIssues));
  sections.push(...formatListBlock("## Next Steps", parsed.nextSteps));

  if (
    hasKnownValue(parsed.continuitySummary) ||
    parsed.recentProgress.length > 0 ||
    parsed.testBuildGitStatus.length > 0
  ) {
    sections.push("## Latest Known Status");
    if (hasKnownValue(parsed.continuitySummary)) {
      sections.push(limitString(parsed.continuitySummary, 1800));
    }
    for (const line of truncateList(parsed.recentProgress, 4)) {
      sections.push(`- ${line}`);
    }
    for (const line of truncateList(parsed.testBuildGitStatus, 4)) {
      sections.push(`- ${line}`);
    }
    sections.push("");
  }

  if (hasKnownValue(parsed.importantContextForNextAi)) {
    sections.push("## Important Context For Next AI");
    sections.push(limitString(parsed.importantContextForNextAi, 1400));
    sections.push("");
  }

  if (parsed.risksWarnings.length > 0) {
    sections.push(...formatListBlock("## Risks / Warnings", parsed.risksWarnings, 5));
  }

  return sections.filter((section, index, all) => {
    if (section !== "") return true;
    return all[index - 1] !== "";
  });
}
