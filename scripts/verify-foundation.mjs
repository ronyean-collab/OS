#!/usr/bin/env node
/**
 * Lightweight verification when Vitest/Electron are not run in CI.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "electron/main/index.ts",
  "electron/preload/index.ts",
  "electron/main/database/schema.ts",
  "electron/main/database/migrations.ts",
  "electron/main/providers/openai-adapter.ts",
  "electron/main/secure-storage/index.ts",
  "src/renderer/src/App.tsx",
  "src/shared/ipc-channels.ts",
  "tests/database.test.ts",
  "tests/persistence-services.test.ts",
  "electron/main/secure-storage/types.ts",
  "electron/main/secure-storage/memory-stub.ts",
  "electron/main/database/test-db.ts",
];

let missing = 0;
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${rel}`);
    missing += 1;
  }
}

if (missing > 0) {
  console.error(`verify-foundation: ${missing} required file(s) missing`);
  process.exit(1);
}

console.log("verify-foundation: all required foundation files present");
process.exit(0);
