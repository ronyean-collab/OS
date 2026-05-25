import type { MarkdownMemoryFileType } from "./types";

export const MARKDOWN_MEMORY_HEADER = "# CONTINUITYOS MEMORY FILE";
export const LEGACY_CONTINUITY_IMPORT_HEADER = "# CONTINUITYOS IMPORT FILE";
export const MARKDOWN_MEMORY_VERSION = 1;

export const MARKDOWN_MEMORY_FILE_NAMES: Record<MarkdownMemoryFileType, string> = {
  "continuity-import": "continuity-import.md",
  "continuity-export": "continuity-export.md",
  "ai-handoff": "ai-handoff.md",
  "thread-summary": "thread-summary.md",
  "project-state": "project-state.md",
};

export type MarkdownMemoryContent = {
  fileType: MarkdownMemoryFileType;
  source: string;
  generatedAt: string;
  projectName: string;
  projectType: string;
  currentObjective: string;
  continuitySummary: string;
  stableFacts: string[];
  recentProgress: string[];
  decisionsMade: string[];
  openIssues: string[];
  nextSteps: string[];
  importantContextForNextAi: string;
  recentConversationExcerpts: string;
  testBuildGitStatus: string[];
  risksWarnings: string[];
  rulesForFutureAi: string[];
};

function section(title: string, body: string): string[] {
  return [`## ${title}`, body.trim() || "UNKNOWN", ""];
}

function listSection(title: string, items: string[]): string[] {
  return [`## ${title}`, ...(items.length > 0 ? items.map((item) => `- ${item}`) : ["- UNKNOWN"]), ""];
}

export function buildMarkdownMemoryFile(content: MarkdownMemoryContent): string {
  return [
    MARKDOWN_MEMORY_HEADER,
    `version: ${MARKDOWN_MEMORY_VERSION}`,
    `file_type: ${content.fileType}`,
    `source: ${content.source}`,
    `generated_at: ${content.generatedAt}`,
    `project_name: ${content.projectName}`,
    `project_type: ${content.projectType}`,
    "",
    ...section("CURRENT OBJECTIVE", content.currentObjective),
    ...section("CONTINUITY SUMMARY", content.continuitySummary),
    ...listSection("STABLE FACTS", content.stableFacts),
    ...listSection("RECENT PROGRESS", content.recentProgress),
    ...listSection("DECISIONS MADE", content.decisionsMade),
    ...listSection("OPEN ISSUES", content.openIssues),
    ...listSection("NEXT STEPS", content.nextSteps),
    ...section("IMPORTANT CONTEXT FOR NEXT AI", content.importantContextForNextAi),
    ...section("RECENT CONVERSATION EXCERPTS", content.recentConversationExcerpts),
    ...listSection("TEST / BUILD / GIT STATUS", content.testBuildGitStatus),
    ...listSection("RISKS / WARNINGS", content.risksWarnings),
    ...listSection("RULES FOR FUTURE AI", content.rulesForFutureAi),
  ]
    .join("\n")
    .trimEnd();
}
