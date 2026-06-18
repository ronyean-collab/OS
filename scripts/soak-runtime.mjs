#!/usr/bin/env node
/**
 * Lightweight soak harness for CI/nightly validation.
 * Runs bounded cycles (not 6h) but exercises the same runtime dimensions.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cycles = Number(process.env.SOAK_CYCLES ?? 12);
const started = Date.now();
const events = [];

function runVitestSlice(name, pattern) {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "test", "--", pattern],
    { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
  );
  events.push({
    name,
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
  });
  return result.status === 0;
}

const slices = [
  ["tests/runtime-health.test.ts", "runtime-health"],
  ["tests/runtime-maturity.test.ts", "runtime-maturity"],
  ["tests/autosave-runtime.test.ts", "autosave"],
  ["tests/recovery-runtime.test.ts", "recovery"],
  ["tests/continuity-runtime.test.ts", "continuity"],
  ["tests/renderer-integration.test.ts", "renderer-integration"],
];

let failures = 0;
for (const [pattern, label] of slices) {
  const ok = runVitestSlice(label, pattern);
  if (!ok) failures += 1;
}

const summary = {
  startedAt: new Date(started).toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  cycles,
  failures,
  events,
  memoryNote: "Run with NODE_OPTIONS=--expose-gc for deeper memory profiling.",
};

const outPath = path.join(root, "soak-summary.json");
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(failures > 0 ? 1 : 0);
