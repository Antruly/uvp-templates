import assert from "node:assert/strict";
import { readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { LIMITS, canonicalJson, readPackage, sha256Hex } from "../scripts/lib/package.mjs";
import { temporaryRoot, writePackage } from "./helpers.mjs";

test("a valid package is accepted and its digest is stable", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory, manifest } = await writePackage(root);

  const result = await readPackage(directory);
  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.equal(result.id, "acme-dashboard");
  assert.equal(result.version, "1.0.0");
  assert.equal(result.digest, `sha256:${sha256Hex(canonicalJson(manifest))}`);
  assert.deepEqual(result.files.map((file) => file.path), ["src/main.cc"]);
});

test("the digest does not depend on manifest key order", async () => {
  const manifest = { schema: "uvp.template/1", id: "a", version: "1.0.0" };
  const reversed = Object.fromEntries(Object.entries(manifest).reverse());
  assert.equal(canonicalJson(manifest), canonicalJson(reversed));
});

test("a file that does not match its declared digest is rejected", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory } = await writePackage(root);
  await writeFile(path.join(directory, "files", "src", "main.cc"), "int main() { return 1; }\n");

  const result = await readPackage(directory);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /does not match the observed bytes/u);
});

test("an undeclared file is rejected", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory } = await writePackage(root);
  await writeFile(path.join(directory, "files", "extra.cc"), "// extra\n");

  const result = await readPackage(directory);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /observed but not declared/u);
});

test("path traversal and archive extensions are rejected", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory } = await writePackage(root, {
    files: { "../escape.cc": "// escape\n", "source.zip": "x" },
  });

  const result = await readPackage(directory);
  assert.equal(result.ok, false);
  const problems = result.problems.join("\n");
  assert.match(problems, /contains a '\.' or '\.\.' segment/u);
  assert.match(problems, /archive/u);
});

test("a missing licence is rejected", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory } = await writePackage(root, { manifest: { license: null } });

  const result = await readPackage(directory);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /license: is required/u);
});

test("a symlink under files/ is rejected", { skip: process.platform === "win32" }, async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory } = await writePackage(root);
  await symlink("src/main.cc", path.join(directory, "files", "link.cc"));

  const result = await readPackage(directory);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /symbolic link/u);
});

test("the manifest is returned as written", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory, manifest } = await writePackage(root, { manifest: { id: "other-id" } });

  const result = await readPackage(directory);
  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.equal(result.id, "other-id");
  assert.equal(manifest.id, "other-id");
  const raw = JSON.parse(await readFile(path.join(directory, "template.json"), "utf8"));
  assert.equal(raw.id, "other-id");
});

test("a package may declare METHOD /path routes", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  const { directory } = await writePackage(root, {
    manifest: { routes: ["GET /hello", "POST /api/items", "WS /ws"] },
  });

  const result = await readPackage(directory);
  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.deepEqual(result.manifest.routes, ["GET /hello", "POST /api/items", "WS /ws"]);
});

test("routes are validated for format, duplicates, count, and shape", async (t) => {
  const root = await temporaryRoot();
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));

  const cases = [
    { routes: ["get /hello"], expected: /routes\[0\]/u },
    { routes: ["GET /hello", "GET /hello"], expected: /duplicates/u },
    { routes: "GET /hello", expected: /must be an array/u },
  ];
  for (const { routes, expected } of cases) {
    const { directory } = await writePackage(root, { manifest: { routes } });
    const result = await readPackage(directory);
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), expected);
  }

  const { directory } = await writePackage(root, {
    manifest: { routes: ["GET /a", "GET /b"] },
  });
  const limited = await readPackage(directory, { ...LIMITS, maxRoutes: 1 });
  assert.equal(limited.ok, false);
  assert.match(limited.problems.join("\n"), /more than 1 route/u);
});
