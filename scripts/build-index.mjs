import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { archivePackage } from "./lib/archive.mjs";
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

// The archive is part of the index: one immutable tarball per version, its
// digest over the `.tgz` (the manifest digest beside it is a different fact).
const archives = [];
for (const pkg of index.packages) {
  for (const version of pkg.versions) {
    const built = await archivePackage(path.join(root, version.path), pkg.id, version.version);
    version.archive = { path: built.path, digest: built.digest, bytes: built.bytes };
    archives.push({ ...built, absolute: path.join(root, built.path) });
  }
}

const rendered = renderIndex(index);
if (write) {
  for (const archive of archives) {
    await mkdir(path.dirname(archive.absolute), { recursive: true });
    await writeFile(archive.absolute, archive.archive);
  }
  await writeFile(target, rendered, "utf8");
  console.log(
    `index.json written (${index.packages.length} package id(s), ${archives.length} archive(s))`,
  );
} else {
  let stale = false;
  for (const archive of archives) {
    const current = await readFile(archive.absolute).catch(() => undefined);
    if (current === undefined) {
      console.error(`archive is missing: ${archive.path}; run: node scripts/build-index.mjs --write`);
      stale = true;
    } else if (!current.equals(archive.archive)) {
      console.error(
        `archive is stale: ${archive.path}; expected ${archive.digest}, got sha256:${createHash("sha256").update(current).digest("hex")}`,
      );
      stale = true;
    }
  }
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== rendered) {
    console.error("index.json is stale; run: node scripts/build-index.mjs --write");
    stale = true;
  }
  if (stale) process.exit(1);
  console.log(
    `index.json is current (${index.packages.length} package id(s), ${archives.length} archive(s))`,
  );
}
