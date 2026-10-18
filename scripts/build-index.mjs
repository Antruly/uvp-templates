import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex, renderIndex } from "./lib/package.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const write = process.argv.includes("--write");
const target = path.join(root, "index.json");
const { problems, index } = await buildIndex(root);

if (problems.length > 0) {
  console.error("package problems:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const rendered = renderIndex(index);
if (write) {
  await writeFile(target, rendered, "utf8");
  console.log(`index.json written (${index.packages.length} package id(s))`);
} else {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== rendered) {
    console.error("index.json is stale; run: node scripts/build-index.mjs --write");
    process.exit(1);
  }
  console.log(`index.json is current (${index.packages.length} package id(s))`);
}
