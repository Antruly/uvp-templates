import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex, scanPackage } from "./lib/package.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagesDir = path.join(root, "packages");

const listPackageDirs = async () => {
  const directories = [];
  let ids;
  try {
    ids = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    return directories;
  }
  for (const id of ids) {
    if (id.name.startsWith(".") || id.name === "README.md" || !id.isDirectory()) continue;
    let versions;
    try {
      versions = await readdir(path.join(packagesDir, id.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const version of versions) {
      if (version.name.startsWith(".") || version.name === "README.md") continue;
      if (!version.isDirectory()) continue;
      directories.push(path.join(packagesDir, id.name, version.name));
    }
  }
  return directories;
};

const { problems } = await buildIndex(root);
if (problems.length > 0) {
  console.error("package problems:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const directories = await listPackageDirs();
const credentialFindings = [];
const piiFindings = [];
let scanned = 0;
let skipped = 0;
let truncated = 0;

for (const directory of directories) {
  const relative = path.relative(root, directory).split(path.sep).join("/");
  const result = await scanPackage(directory);
  scanned += result.scanned.length;
  skipped += result.skipped.length;
  if (result.truncated) truncated += 1;
  for (const finding of result.findings) {
    if (finding.kind === "credential") credentialFindings.push({ relative, ...finding });
    else piiFindings.push({ relative, ...finding });
  }
}

console.log(
  `preflight: ${directories.length} package version(s), ${scanned} file(s) scanned, ` +
    `${skipped} skipped, ${credentialFindings.length} credential finding(s), ` +
    `${piiFindings.length} PII finding(s), ${truncated} truncated scan(s)`,
);

if (credentialFindings.length > 0) {
  console.error("\ncredential-shaped findings (blocking):");
  for (const finding of credentialFindings) {
    console.error(`  ${finding.relative}/${finding.path}:${finding.line} ${finding.rule} ${finding.redacted}`);
  }
}
if (piiFindings.length > 0) {
  console.error("\nPII-shaped findings (resolve before approval):");
  for (const finding of piiFindings) {
    console.error(`  ${finding.relative}/${finding.path}:${finding.line} ${finding.rule} ${finding.redacted}`);
  }
}
if (truncated > 0) {
  console.error("\nthe scan was truncated; the findings are not a complete answer for the affected packages");
}

if (credentialFindings.length > 0) process.exit(1);
