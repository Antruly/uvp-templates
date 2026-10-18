import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { LIMITS, scanPackage } from "../scripts/lib/package.mjs";
import { temporaryRoot, writePackage } from "./helpers.mjs";

const cleanup = (root) => rm(root, { recursive: true, force: true });

test("credential shapes are reported and redacted", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  const { directory } = await writePackage(root, {
    topLevel: {
      "NOTES.md": "key: AKIAABCDEFGHIJKLMNOP\n",
    },
  });

  const result = await scanPackage(directory);
  const credential = result.findings.find((finding) => finding.rule === "aws_access_key");
  assert.equal(credential?.kind, "credential");
  assert.equal(credential?.redacted, "AKIA…");
  assert.equal(JSON.stringify(result.findings).includes("AKIAABCDEFGHIJKLMNOP"), false);
  assert.deepEqual(result.scanned.includes("NOTES.md"), true);
});

test("PII shapes are classified separately", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  const { directory } = await writePackage(root, {
    topLevel: { "CONTACT.md": "mail person@example.test\n" },
  });

  const result = await scanPackage(directory);
  const email = result.findings.find((finding) => finding.rule === "email");
  assert.equal(email?.kind, "pii");
  assert.equal(email?.redacted.includes("person"), false);
});

test("binary files are skipped and named", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  const { directory } = await writePackage(root, {
    topLevel: { "asset.bin": Buffer.from([0, 1, 2, 3]) },
  });

  const result = await scanPackage(directory);
  assert.deepEqual(result.scanned.includes("asset.bin"), false);
  const skipped = result.skipped.find((entry) => entry.path === "asset.bin");
  assert.match(skipped?.reason ?? "", /binary/u);
});

test("files larger than the limit are not read", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  const { directory } = await writePackage(root, {
    topLevel: { "large.txt": "0123456789\n" },
  });

  const result = await scanPackage(directory, { ...LIMITS, maxFileBytes: 4 });
  const skipped = result.skipped.find((entry) => entry.path === "large.txt");
  assert.match(skipped?.reason ?? "", /larger than 4 bytes/u);
  assert.deepEqual(result.scanned.includes("large.txt"), false);
});

test("the scan reports the files it read", async (t) => {
  const root = await temporaryRoot();
  t.after(() => cleanup(root));
  const { directory } = await writePackage(root);

  const result = await scanPackage(directory);
  assert.deepEqual(result.scanned.sort(), ["LICENSE", "README.md", "files/src/main.cc", "template.json"]);
});
