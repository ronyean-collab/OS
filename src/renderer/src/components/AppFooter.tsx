import type { AppState } from "@shared/types";

type Props = {
  appState: AppState | null;
};

export function AppFooter({ appState }: Props) {
  const v = appState?.version;
  if (!v) return null;

  return (
    <footer className="app-footer" aria-label="Application version">
      <span>{v.appName} v{v.appVersion}</span>
      <span className="sep">·</span>
      <span>Schema v{appState?.appliedMigrationVersion ?? v.schemaVersion}</span>
      <span className="sep">·</span>
      <span>Build {v.buildNumber}</span>
    </footer>
  );
}
