#!/usr/bin/env node
/** Run 24h / 48h / 72h soak modes (SOAK_FAST=1 for CI evidence matrix). */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fast =
  process.env.SOAK_FAST === "1" ||
  process.env.SOAK_FAST === "true" ||
  process.env.CI === "true" ||
  !process.env.SOAK_WALL_CLOCK;

for (const mode of ["24h", "48h", "72h"]) {
  console.log(`\n=== Soak mode: ${mode} (fast=${fast}) ===\n`);
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts/soak/endurance-runner.mjs")],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, SOAK_MODE: mode, SOAK_FAST: fast ? "1" : "0" },
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

spawnSync(process.execPath, [path.join(root, "scripts/soak/generate-full-soak-report.mjs")], {
  cwd: root,
  stdio: "inherit",
});
