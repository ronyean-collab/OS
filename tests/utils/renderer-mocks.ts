import type { AppState, ProviderTestResult } from "../../src/shared/types";

export function mockAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    recoveryMode: false,
    recoveryMessage: null,
    activeWorkspaceId: "ws-mock",
    activeThreadId: "th-mock",
    dbReady: true,
    continuityHealthy: true,
    lastSnapshotAt: null,
    lastSuccessfulPersistenceAt: null,
    version: "0.1.0",
    appliedMigrationVersion: 12,
    migrationsJustApplied: [],
    previousSessionCrashed: false,
    downgradeDetected: false,
    startupWarnings: [],
    interruptedResponsesRecovered: 0,
    sqliteRepairAttempted: false,
    sqliteIntegrityRestored: false,
    reliabilityMessage: null,
    providerSetupRequired: false,
    providerReady: true,
    selectedProvider: "ollama",
    providerReadinessStatus: "ready",
    runtimeHealthScore: 0.85,
    recoveryConfidenceScore: 0.8,
    ...overrides,
  };
}

export function mockProviderTestResult(
  overrides: Partial<ProviderTestResult> = {},
): ProviderTestResult {
  return {
    ok: true,
    status: "ready",
    message: "Provider ready",
    model: "llama3.1:latest",
    ...overrides,
  };
}

export function mockOllamaReconnectSequence(): ProviderTestResult[] {
  return [
    mockProviderTestResult({ ok: false, status: "ollama_not_running", message: "Not running" }),
    mockProviderTestResult({ ok: false, status: "model_missing", message: "No model" }),
    mockProviderTestResult({ ok: true, status: "ready", message: "Ready" }),
  ];
}
