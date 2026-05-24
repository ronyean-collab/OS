import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const cmd = args.length > 0 ? ["vitest", "run", ...args] : ["test"];
const out = join(root, "vitest-last-run.txt");

const result = spawnSync("npx", cmd, {
  cwd: root,
  encoding: "utf8",
  shell: true,
  maxBuffer: 30 * 1024 * 1024,
});

const text = [`exit: ${result.status}`, result.stdout ?? "", result.stderr ?? ""].join("\n");
writeFileSync(out, text, "utf8");
console.log(`Wrote ${out} exit=${result.status}`);
process.exit(result.status ?? 1);
