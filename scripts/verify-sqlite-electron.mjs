import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
try {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.close();
  console.log("electron better-sqlite3 OK");
  process.exit(0);
} catch (err) {
  console.error("electron better-sqlite3 FAILED:", err?.message ?? err);
  process.exit(1);
}
