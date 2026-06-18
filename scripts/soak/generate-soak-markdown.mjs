#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const mode of ["24h", "48h", "72h"]) {
  const reportPath = path.join(root, "soak-runs", mode, "soak-report.json");
  const outPath = path.join(root, `${mode}-soak-report.md`);
  if (!fs.existsSync(reportPath)) {
    const stub = `# ${mode} Soak Report

**Status:** Not run yet.

Run: \`SOAK_MODE=${mode} SOAK_FAST=1 npm run test:soak:endurance\` (fast) or full duration on release hardware.
`;
    fs.writeFileSync(outPath, stub);
    continue;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const md = `# ${mode} Soak Report

**Phase:** 9 — Daily Driver Hardening  
**Generated:** ${new Date().toISOString()}  
**Mode:** ${report.mode} ${report.fast ? "(fast CI)" : "(full duration)"}

## Summary

| Metric | Value |
|--------|-------|
| Total cycles | ${report.totalCycles} |
| Failed cycles | ${report.failedCycles} |
| Peak heap (MB) | ${report.peakHeapMb} |
| Peak RSS (MB) | ${report.peakRssMb} |
| Peak heap growth (MB) | ${report.peakHeapGrowthMb ?? "—"} |
| Avg runtime health | ${report.avgRuntimeHealthScore ?? "—"} |
| Avg recovery confidence | ${report.avgRecoveryConfidenceScore ?? "—"} |
| Memory growth warnings | ${report.memoryGrowthWarnings ?? 0} |
| Performance warnings | ${report.performanceWarnings ?? 0} |
| Actual duration (ms) | ${report.actualDurationMs} |

## Warnings

${report.memoryGrowthWarnings > 0 ? "- **Memory growth** detected across cycles — review long-session heap on release hardware." : "- No memory growth warnings."}
${report.performanceWarnings > 0 ? "- **Performance degradation** signals (slow assembly/reconstruction or low health score)." : "- No performance degradation warnings."}

## Latest cycle

\`\`\`json
${JSON.stringify(report.cycles[report.cycles.length - 1] ?? {}, null, 2)}
\`\`\`

## Verdict

${report.failedCycles === 0 ? `**PASS** for ${mode} soak scope.` : `**FAIL** — ${report.failedCycles} cycle(s) with test failures.`}
`;
  fs.writeFileSync(outPath, md);
  console.log(`Wrote ${outPath}`);
}
