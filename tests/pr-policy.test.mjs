import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = path.resolve(
  fileURLToPath(new URL("../scripts/check-pr-policy.mjs", import.meta.url)),
);

const check = (body) =>
  spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, PR_BODY: body },
  });

test("a human-authored submission passes", () => {
  const result = check("AI-assisted: no\n");
  assert.equal(result.status, 0, result.stderr);
});

test("an AI-assisted submission with a human owner passes", () => {
  const result = check("AI-assisted: yes\nHuman owner: @Antruly\n");
  assert.equal(result.status, 0, result.stderr);
});

test("an AI-assisted submission without a human owner fails", () => {
  for (const body of ["AI-assisted: yes\nHuman owner: none\n", "AI-assisted: yes\n"]) {
    const result = check(body);
    assert.equal(result.status, 1, body);
  }
});

test("a missing disclosure fails", () => {
  const result = check("## Package\n\n- Package: acme@1.0.0\n");
  assert.equal(result.status, 1);
});

test("an empty body fails", () => {
  const result = check("");
  assert.equal(result.status, 1);
});
