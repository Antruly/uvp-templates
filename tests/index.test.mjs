import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import { buildIndex, compareVersions, renderIndex } from "../scripts/lib/package.mjs";
import { temporaryRoot, writePackage } from "./helpers.mjs";

const cleanup = (root) => rm(root, { recursive: true, force: true });

test("SemVer order is numeric, not lexical", () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.equal(compareVersions("1.0.0+build.2", "1.0.0+build.1"), 0);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
});

test("the index picks the highest release and sorts versions", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  await writePackage(root, { version: "1.9.0" });
  await writePackage(root, { version: "1.10.0" });

  const { problems, index } = await buildIndex(root);
  assert.deepEqual(problems, []);
  assert.equal(index.schema, "uvp.registry/1");
  assert.equal(index.packages.length, 1);
  assert.equal(index.packages[0].latest, "1.10.0");
  assert.deepEqual(
    index.packages[0].versions.map((entry) => entry.version),
    ["1.9.0", "1.10.0"],
  );
});

test("a release outranks a prerelease for latest", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  await writePackage(root, { version: "1.0.0" });
  await writePackage(root, { version: "1.1.0-rc.1" });

  const { problems, index } = await buildIndex(root);
  assert.deepEqual(problems, []);
  assert.equal(index.packages[0].latest, "1.0.0");
});

test("the index is deterministic", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  await writePackage(root, { version: "1.0.0" });

  const first = await buildIndex(root);
  const second = await buildIndex(root);
  assert.equal(renderIndex(first.index), renderIndex(second.index));
});

test("a directory id that disagrees with the manifest is a problem", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  await writePackage(root, { id: "acme-dashboard", version: "1.0.0", manifest: { id: "other-id" } });

  const { problems, index } = await buildIndex(root);
  assert.equal(index.packages.length, 0);
  assert.match(problems.join("\n"), /does not match the directory/u);
});
