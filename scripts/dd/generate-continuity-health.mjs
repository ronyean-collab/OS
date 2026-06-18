#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = path.join(root, "continuity-health-report.md");

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "run",
    "test",
    "--",
    "tests/runtime-maturity.test.ts",
    "tests/runtime-health.test.ts",
    "tests/continuity-runtime.test.ts",
    "--reporter=verbose",
  ],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
);

const passed = result.status === 0;
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

const md = `# Continuity Health Report

**Phase:** 9 — Daily Driver Hardening  
**Generated:** ${new Date().toISOString()}

## Automated signals

| Signal | Status |
|--------|--------|
| Runtime maturity tests | ${passed ? "PASS" : "FAIL"} |
| Runtime health snapshots | ${passed ? "PASS" : "FAIL"} |
| Continuity runtime (10k/50k sims) | ${passed ? "PASS" : "FAIL"} |

## Monitored dimensions

- **Continuity confidence** — derived from runtime health input and memory state
- **Drift score** — elevated drift triggers warnings (threshold 0.62)
- **Reconstruction quality** — thread reconstruction + replay hash validation
- **Recovery quality** — interrupted streams, recovery mode, autosave lane
- **Continuity health** — workspace health scan (healthy / attention / unhealthy)

## Recommendations (auto-generated)

${
  passed
    ? `1. Continue **24h+ soak** on release hardware.
2. Run manual QA for encrypted backup roundtrip monthly.
3. Review drift timeline in Continuity Inspector if health drops to "attention".`
    : `1. **Fix failing continuity tests** before daily-driver promotion.
2. Export workspace before any repair attempts.
3. Re-run \`npm test\` and inspect continuity-runtime output.`
}

## Saturation watch

- Repeated low confidence events → review memory compression cadence
- Excessive drift → run continuity rebuild from canonical messages
- Weak reconstruction → validate replay hash and snapshot metadata

## Verdict

**${passed ? "HEALTHY for automated daily-driver scope" : "ATTENTION REQUIRED — test failures detected"}**
`;

fs.writeFileSync(outPath, md);
console.log(`Wrote ${outPath}`);
process.exit(passed ? 0 : 1);
