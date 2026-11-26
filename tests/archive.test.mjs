import { execFileSync } from "node:child_process";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { archivePackage } from "../scripts/lib/archive.mjs";
import { temporaryRoot, writePackage } from "./helpers.mjs";

let root;
let tarball;

before(async () => {
  root = await temporaryRoot("uvp-archive-");
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

const listing = (bytes) => {
  const target = path.join(root, "inspect.tgz");
  return writeFile(target, bytes).then(() =>
    execFileSync("tar", ["-tzf", target], { encoding: "utf8" }).trim().split("\n"),
  );
};

describe("the package archive", () => {
  it("is byte-identical across runs and lists the package at its root", async () => {
    const { directory } = await writePackage(root);
    const first = await archivePackage(directory, "acme-dashboard", "1.0.0");
    const second = await archivePackage(directory, "acme-dashboard", "1.0.0");

    assert.equal(first.path, "archives/acme-dashboard/1.0.0.tgz");
    assert.match(first.digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(first.digest, second.digest);
    assert.deepEqual(first.archive, second.archive);

    const entries = await listing(first.archive);
    for (const required of ["template.json", "README.md", "LICENSE", "files/src/main.cc"]) {
      assert.ok(entries.includes(required), `missing ${required}`);
    }
  });

  it("splits a path longer than 100 bytes into ustar name and prefix", async () => {
    // ustar stores 100 bytes of name and 155 of prefix. A deep package path is
    // the case that would otherwise be silently truncated.
    const long = `${"a".repeat(60)}/${"b".repeat(50)}.txt`;
    const { directory } = await writePackage(root, {
      id: "acme-long",
      files: { [long]: "deep\n" },
    });
    const archive = await archivePackage(directory, "acme-long", "1.0.0");
    const entries = await listing(archive.archive);
    const delivered = `files/${long}`;
    assert.ok(entries.includes(delivered), `missing ${delivered}: ${entries.join(", ")}`);
  });

  it("refuses a symlink instead of archiving what it points at", async () => {
    const { directory } = await writePackage(root, { id: "acme-link" });
    await mkdir(path.join(directory, "files"), { recursive: true });
    await symlink("/etc/passwd", path.join(directory, "files", "link"));

    await assert.rejects(
      () => archivePackage(directory, "acme-link", "1.0.0"),
      /symlink/u,
    );
  });
});
