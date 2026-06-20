import fs from "node:fs/promises";
import path from "node:path";

import {
  OLLAMA_DEFAULT_BASE_URLS,
  OLLAMA_MANAGED_BASE_URL,
  buildOllamaProbeUrls,
  normalizeOllamaBaseUrl,
} from "../../../src/shared/ollama-endpoints";

import { listOllamaModels } from "./local-ai-service";
import {
  findOllamaExecutable,
  isRuntimeReachable,
} from "./local-runtime-provisioner";

export type OllamaDiagnosticCheck = {
  name: string;
  ok: boolean;
  reason: string;
};

export type OllamaStartupDiagnosticReport = {
  generatedAt: string;
  checks: OllamaDiagnosticCheck[];
  executablePath: string | null;
  reachableBaseUrl: string | null;
  ollamaHostEnv: string | null;
  models: string[];
};

async function firstReachableBaseUrl(): Promise<string | null> {
  for (const baseUrl of buildOllamaProbeUrls()) {
    try {
      if (await isRuntimeReachable(baseUrl)) {
        return normalizeOllamaBaseUrl(baseUrl);
      }
    } catch {
      // Continue checking known local endpoints.
    }
  }

  return null;
}

export async function runOllamaStartupDiagnostic(): Promise<OllamaStartupDiagnosticReport> {
  const checks: OllamaDiagnosticCheck[] = [];
  const ollamaHostEnv = process.env.OLLAMA_HOST?.trim() || null;
  const executablePath = await findOllamaExecutable();

  checks.push({
    name: "Ollama executable available",
    ok: Boolean(executablePath),
    reason: executablePath
      ? `Executable found at ${executablePath}`
      : "Ollama executable was not found on PATH or known local install paths.",
  });

  const reachableBaseUrl = await firstReachableBaseUrl();

  checks.push({
    name: "Local Ollama endpoint reachable",
    ok: Boolean(reachableBaseUrl),
    reason: reachableBaseUrl
      ? `Local endpoint responded at ${reachableBaseUrl}`
      : "No configured local Ollama endpoint responded.",
  });

  checks.push({
    name: "OLLAMA_HOST configuration",
    ok: true,
    reason: ollamaHostEnv
      ? `OLLAMA_HOST is set to ${normalizeOllamaBaseUrl(ollamaHostEnv)}`
      : "OLLAMA_HOST is not set; configured local defaults will be used.",
  });

  let models: string[] = [];

  if (reachableBaseUrl) {
    try {
      const discovered = await listOllamaModels(reachableBaseUrl);

      models = discovered
        .map((model) => {
          if (typeof model === "string") {
            return model;
          }

          if (
            model &&
            typeof model === "object" &&
            "name" in model &&
            typeof model.name === "string"
          ) {
            return model.name;
          }

          return "";
        })
        .filter((name): name is string => Boolean(name.trim()));

      checks.push({
        name: "Local models available",
        ok: models.length > 0,
        reason:
          models.length > 0
            ? `${models.length} local model(s) found.`
            : "Ollama responded, but no local models were listed.",
      });
    } catch (error) {
      checks.push({
        name: "Local models available",
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Could not list local Ollama models.",
      });
    }
  } else {
    checks.push({
      name: "Local models available",
      ok: false,
      reason: "Model discovery skipped because no local endpoint responded.",
    });
  }

  checks.push({
    name: "Managed local fallback configured",
    ok: Boolean(OLLAMA_MANAGED_BASE_URL),
    reason: `Managed local fallback: ${OLLAMA_MANAGED_BASE_URL}`,
  });

  checks.push({
    name: "Known local endpoint configuration",
    ok: OLLAMA_DEFAULT_BASE_URLS.length > 0,
    reason: `${OLLAMA_DEFAULT_BASE_URLS.length} local endpoint candidate(s) configured.`,
  });

  return {
    generatedAt: new Date().toISOString(),
    checks,
    executablePath,
    reachableBaseUrl,
    ollamaHostEnv,
    models,
  };
}

export function formatOllamaStartupDiagnosticMarkdown(
  report: OllamaStartupDiagnosticReport,
): string {
  const lines = [
    "# Ollama startup diagnostic",
    "",
    `Generated: ${report.generatedAt}`,
    `Executable: ${report.executablePath ?? "(not found)"}`,
    `Reachable endpoint: ${report.reachableBaseUrl ?? "(none)"}`,
    `OLLAMA_HOST: ${report.ollamaHostEnv ?? "(not set)"}`,
    "",
    "## Checks",
    "",
  ];

  for (const check of report.checks) {
    lines.push(
      `- ${check.ok ? "PASS" : "FAIL"} — ${check.name}: ${check.reason}`,
    );
  }

  lines.push("", "## Local models", "");

  if (report.models.length > 0) {
    for (const model of report.models) {
      lines.push(`- ${model}`);
    }
  } else {
    lines.push("- No local models reported.");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeOllamaStartupDiagnosticFile(
  repoRoot: string,
): Promise<string> {
  const report = await runOllamaStartupDiagnostic();
  const markdown = formatOllamaStartupDiagnosticMarkdown(report);
  const outputPath = path.join(repoRoot, "ollama-startup-diagnostic.md");

  await fs.writeFile(outputPath, markdown, "utf8");

  return outputPath;
}
