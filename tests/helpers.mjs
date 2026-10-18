import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const digestOf = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

export const writePackage = async (
  root,
  {
    id = "acme-dashboard",
    version = "1.0.0",
    files = { "src/main.cc": "int main() { return 0; }\n" },
    manifest = {},
    topLevel = {},
  } = {},
) => {
  const directory = path.join(root, "packages", id, version);
  await mkdir(path.join(directory, "files"), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(directory, "files", ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const declared = Object.entries(files).map(([relative, content]) => ({
    path: relative,
    digest: digestOf(content),
    bytes: Buffer.byteLength(content),
  }));
  const merged = {
    schema: "uvp.template/1",
    id,
    version,
    name: "Acme dashboard",
    category: "fullstack",
    files: declared,
    license: { spdx: "MIT", file: "LICENSE" },
    provenance: { author: "Acme", createdAt: "2026-10-18T00:00:00Z" },
    ...manifest,
  };
  for (const key of ["license", "provenance"]) {
    if (merged[key] === null) delete merged[key];
  }
  await writeFile(path.join(directory, "template.json"), JSON.stringify(merged));
  await writeFile(path.join(directory, "README.md"), "# Acme\n");
  if (merged.license !== undefined) await writeFile(path.join(directory, "LICENSE"), "MIT\n");
  for (const [name, content] of Object.entries(topLevel)) {
    await writeFile(path.join(directory, name), content);
  }
  return { directory, manifest: merged, declared };
};

export const temporaryRoot = async (prefix = "uvp-registry-") =>
  mkdtemp(path.join(tmpdir(), prefix));
