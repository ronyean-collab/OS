/** Workspace panel routing (Project Tools). */

export type WorkspaceOpsTabId = "providers" | "backups" | "settings";

export const WORKSPACE_OPS_TABS: ReadonlyArray<{ id: WorkspaceOpsTabId; label: string }> = [
  { id: "backups", label: "Backups" },
  { id: "settings", label: "Settings" },
] as const;

/** Map legacy tab ids from earlier builds. */
export function normalizeWorkspaceOpsTab(tab: string): WorkspaceOpsTabId {
  if (tab === "providers" || tab === "local-ai") return "settings";
  if (tab === "backups" || tab === "overview" || tab === "restore-points") return "backups";
  return "settings";
}

export function postOnboardingWorkspaceTab(_choiceId: string): WorkspaceOpsTabId {
  return "settings";
}
