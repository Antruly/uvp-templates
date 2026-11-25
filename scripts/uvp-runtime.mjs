import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex } from "./lib/package.mjs";

/**
 * The runtime lane: use the latest published uvp to validate, import,
 * generate, and build every package.
 *
 * It is a forward contract. The published uvp release must expose:
 *
 *   uvp template validate <dir> --json
 *   uvp template import <dir> --json
 *   uvp init <workspace> --name <name> --template-package <id>@<version>
 *   uvp build <workspace>
 *
 * If the release does not expose them, this script exits 78 (EX_CONFIG) with an
 * `undetermined` message. It never turns a missing command into a pass.
 */

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const UNDETERMINED = 78;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs ?? 10 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...options.env },
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  if (result.error !== undefined) {
    return { ok: false, status: undefined, stdout: "", stderr: String(result.error.message) };
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const version = run("uvp", ["--version"], { timeoutMs: 30_000 });
if (!version.ok) {
  console.error("undetermined: `uvp` is not available on PATH");
  console.error(version.stderr);
  process.exit(UNDETERMINED);
}
const uvpVersion = version.stdout.trim() || version.stderr.trim();
console.log(`uvp: ${uvpVersion}`);

const templateHelp = run("uvp", ["template", "validate", "--help"], { timeoutMs: 30_000 });
if (!templateHelp.ok) {
  console.error("undetermined: the published uvp does not expose `uvp template validate`");
  console.error(templateHelp.stderr);
  process.exit(UNDETERMINED);
}
const initHelp = run("uvp", ["init", "--help"], { timeoutMs: 30_000 });
const initHelpText = `${initHelp.stdout}\n${initHelp.stderr}`;
if (!initHelp.ok || !initHelpText.includes("--template-package")) {
  console.error("undetermined: the published uvp does not expose `uvp init --template-package`");
  console.error(initHelp.stderr);
  process.exit(UNDETERMINED);
}

const { problems, index } = await buildIndex(root);
if (problems.length > 0) {
  console.error("package problems:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
if (index.packages.length === 0) {
  console.log("no packages to run");
  process.exit(0);
}

const temporary = await mkdtemp(path.join(os.tmpdir(), "uvp-templates-runtime-"));
let failed = false;
try {
  for (const entry of index.packages) {
    for (const versionEntry of entry.versions) {
      const directory = path.join(root, versionEntry.path);
      const label = `${entry.id}@${versionEntry.version}`;
      console.log(`\n== ${label} ==`);
      const workspace = path.join(temporary, `ws-${entry.id}-${versionEntry.version}`);
      const environment = { UVP_TEMPLATE_HOME: path.join(temporary, "store") };
      const steps = [
        ["validate", ["template", "validate", directory, "--json"], {}],
        ["import", ["template", "import", directory, "--json"], environment],
        ["init", ["init", workspace, "--name", entry.id, "--template-package", label], environment],
      ];
      let stopped = false;
      const reportFailure = (name, result) => {
        failed = true;
        stopped = true;
        console.error(`${name} failed (exit ${String(result.status)})`);
        if (result.stdout) console.error(result.stdout);
        if (result.stderr) console.error(result.stderr);
      };
      for (const [name, args, env] of steps) {
        const result = run("uvp", args, { env });
        if (!result.ok) {
          reportFailure(name, result);
          break;
        }
        console.log(`${name}: ok`);
      }
      if (stopped) continue;

      const built = run("uvp", ["build", workspace], { env: environment });
      if (built.ok) {
        console.log("build: ok");
        continue;
      }
      if (existsSync(path.join(workspace, "CMakeLists.txt"))) {
        reportFailure("build", built);
        continue;
      }
      // A `frontend` package is a skin, not a service: uvp init renders it,
      // but uvp build refuses a workspace with no CMakeLists.txt. Build the
      // app it actually ships, and say that the C++ build did not happen.
      const frontend = path.join(workspace, "frontend");
      if (versionEntry.category !== "frontend" || !existsSync(path.join(frontend, "package.json"))) {
        reportFailure("build", built);
        continue;
      }
      console.log(`build: skipped (no CMakeLists.txt; ${versionEntry.category} package ships no C++ service)`);
      for (const [name, args] of [
        ["frontend install", ["ci"]],
        ["frontend build", ["run", "build"]],
      ]) {
        const result = run("npm", args, { cwd: frontend });
        if (!result.ok) {
          reportFailure(name, result);
          break;
        }
        console.log(`${name}: ok`);
      }
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
}

if (failed) process.exit(1);
console.log(
  "\nruntime lane: validate, import, and init passed for every package; the build each package ships passed too",
);
