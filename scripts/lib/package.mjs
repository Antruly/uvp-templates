import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * The registry's provisional package preflight and index builder.
 *
 * The package format is owned by uvp. This module implements the subset the
 * registry needs in order to reject a malformed or dangerous tree before the
 * runtime lane hands it to uvp: required fields, paths, limits, the two-way
 * file list, licence/provenance, and a bounded secret/PII scan.
 *
 * It is deliberately not a second schema authority. When uvp publishes
 * `uvp template validate`, that command becomes the format check and this
 * subset shrinks. Do not add a rule here that uvp does not have.
 */

export const REGISTRY_SCHEMA = "uvp.registry/1";
export const PACKAGE_SCHEMA = "uvp.template/1";

export const CATEGORIES = ["frontend", "backend", "fullstack", "module"];
export const FRAMEWORKS = ["h5", "vue3", "react", "svelte", "alpine", "htmx"];
export const FEATURES = ["tls", "http2", "http3", "grpc", "websocket", "soap", "db"];

export const LIMITS = Object.freeze({
  maxFiles: 512,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxPathLength: 240,
  maxNameLength: 80,
  maxDescriptionLength: 2000,
  maxTags: 20,
  maxTagLength: 32,
  maxIdLength: 64,
  maxAuthorLength: 120,
  maxRevisionLength: 120,
  maxLicenseNameLength: 80,
  maxSpdxLength: 64,
  maxRoutes: 64,
  maxRouteLength: 200,
});

const PREVIEW_NAMES = new Set(["preview.png", "preview.svg", "preview.webp"]);
const TOP_LEVEL_FILES = new Set(["template.json", "README.md", "LICENSE", ...PREVIEW_NAMES]);

const ARCHIVE_EXTENSIONS = new Set(["7z", "gz", "rar", "tar", "tgz", "xz", "zip"]);
const EXECUTABLE_EXTENSIONS = new Set([
  "a",
  "app",
  "bin",
  "class",
  "dll",
  "dylib",
  "exe",
  "jar",
  "lib",
  "o",
  "obj",
  "so",
  "wasm",
]);

const WINDOWS_RESERVED = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SPDX = /^[A-Za-z0-9.+-]+$/u;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

const sortValue = (value) => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortValue(value[key]);
    return sorted;
  }
  return value;
};

/** RFC 8785-style canonical JSON: sorted keys, no whitespace. */
export const canonicalJson = (value) => JSON.stringify(sortValue(value));

export const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export class Problems {
  constructor() {
    this.items = [];
  }

  add(location, message) {
    this.items.push(location === "" ? message : `${location}: ${message}`);
  }

  get length() {
    return this.items.length;
  }
}

const textProblem = (value, maximum, label) => {
  if (typeof value !== "string" || value.length === 0) return `${label} must be a non-empty string`;
  if (value.length > maximum) return `${label} is longer than ${maximum} characters`;
  if (CONTROL.test(value)) return `${label} contains a control character`;
  if (value.includes("\n") || value.includes("\r")) return `${label} must be a single line`;
  return undefined;
};

export const parseVersion = (value) => {
  if (typeof value !== "string") return undefined;
  const match = SEMVER.exec(value);
  if (match === null) return undefined;
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4] === undefined ? undefined : match[4].split("."),
    build: match[5],
  };
};

const comparePrerelease = (left, right) => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/u.test(a);
    const bNumeric = /^\d+$/u.test(b);
    if (aNumeric && bNumeric) {
      // Numeric identifiers have no leading zeros, so length is the exact
      // comparison and avoids Number precision loss.
      if (a.length !== b.length) return a.length < b.length ? -1 : 1;
      if (a !== b) return a < b ? -1 : 1;
    } else if (aNumeric) {
      return -1;
    } else if (bNumeric) {
      return 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
};

/** SemVer precedence; build metadata is ignored, as the specification says. */
export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === undefined || b === undefined) return left < right ? -1 : left > right ? 1 : 0;
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === undefined && b.prerelease === undefined) return 0;
  if (a.prerelease === undefined) return 1;
  if (b.prerelease === undefined) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
};

const pathProblem = (value, limits) => {
  if (typeof value !== "string" || value.length === 0) return "must be a non-empty string";
  if (value.length > limits.maxPathLength) {
    return `is longer than ${limits.maxPathLength} characters`;
  }
  if (value.startsWith("/") || /^[A-Za-z]:/u.test(value) || value.startsWith("~")) {
    return "must be relative to the package's files/ directory";
  }
  if (value === "files" || value.startsWith("files/")) {
    return "must not name the files/ directory";
  }
  if (value.includes("\\")) return "must use '/' as the separator";
  if (CONTROL.test(value)) return "contains a control character";
  if (/[<>:"|?*]/u.test(value)) return "contains a character that is not portable to Windows";
  for (const segment of value.split("/")) {
    if (segment.length === 0) return "contains an empty path segment";
    if (segment === "." || segment === "..") return "contains a '.' or '..' segment";
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      return "has a segment ending in a dot or space";
    }
    const base = segment.split(".")[0].toUpperCase();
    if (WINDOWS_RESERVED.has(base)) return `uses the reserved device name '${segment}'`;
  }
  const extension = path.extname(value).slice(1).toLowerCase();
  if (ARCHIVE_EXTENSIONS.has(extension)) return "is an archive; extract it before packaging";
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    return "is an executable or object file; package source, not binaries";
  }
  return undefined;
};

const checkKnownKeys = (record, allowed, location, problems) => {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) problems.add(location, `has an unknown field '${key}'`);
  }
};

const walkFiles = async (filesDir, limits, problems) => {
  const observations = [];
  const seen = new Set();
  let total = 0;

  const walk = async (directory, relative) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      problems.add(relative === "" ? "files" : `files/${relative}`, `could not be listed: ${error.message}`);
      return;
    }
    for (const entry of entries) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const location = `files/${child}`;
      const problem = pathProblem(child, limits);
      if (problem !== undefined) {
        problems.add(location, problem);
        continue;
      }
      const lower = child.toLowerCase();
      if (seen.has(lower)) problems.add(location, "collides with another path case-insensitively");
      seen.add(lower);
      if (entry.isSymbolicLink()) {
        problems.add(location, "is a symbolic link");
        continue;
      }
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), child);
        continue;
      }
      if (!entry.isFile()) {
        problems.add(location, "is not a regular file");
        continue;
      }
      let info;
      let content;
      try {
        info = await stat(path.join(directory, entry.name));
        if (info.size > limits.maxFileBytes) {
          problems.add(location, `is larger than ${limits.maxFileBytes} bytes`);
          continue;
        }
        content = await readFile(path.join(directory, entry.name));
      } catch (error) {
        problems.add(location, `could not be read: ${error.message}`);
        continue;
      }
      if (info.nlink > 1) problems.add(location, "is a hard link");
      total += content.byteLength;
      if (total > limits.maxTotalBytes) {
        problems.add("files", `contains more than ${limits.maxTotalBytes} bytes`);
        continue;
      }
      observations.push({
        path: child,
        bytes: content.byteLength,
        digest: `sha256:${sha256Hex(content)}`,
        binary: content.includes(0),
      });
      if (observations.length > limits.maxFiles) {
        problems.add("files", `contains more than ${limits.maxFiles} files`);
      }
    }
  };

  await walk(filesDir, "");
  return observations;
};

const validateTimestamp = (value) => {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  // Reject calendar-invalid dates such as 2026-02-30, which Date normalises.
  return parsed.toISOString().slice(0, 19) === value.slice(0, 19);
};

const validateManifest = (manifest, observed, names, limits, problems) => {
  checkKnownKeys(
    manifest,
    new Set([
      "schema",
      "id",
      "version",
      "name",
      "description",
      "category",
      "framework",
      "tags",
      "requires",
      "variables",
      "files",
      "license",
      "provenance",
      "preview",
      "routes",
    ]),
    "template.json",
    problems,
  );

  if (manifest.schema !== PACKAGE_SCHEMA) {
    problems.add("schema", `must be exactly '${PACKAGE_SCHEMA}'`);
  }
  if (typeof manifest.id !== "string" || !SLUG.test(manifest.id)) {
    problems.add("id", "must be a lowercase slug");
  } else if (manifest.id.length > limits.maxIdLength) {
    problems.add("id", `is longer than ${limits.maxIdLength} characters`);
  }
  if (parseVersion(manifest.version) === undefined) {
    problems.add("version", "must be SemVer 2.0.0 without a range");
  }

  const nameProblem = textProblem(manifest.name, limits.maxNameLength, "name");
  if (nameProblem !== undefined) problems.add("name", nameProblem);
  if (manifest.description !== undefined) {
    const problem = textProblem(manifest.description, limits.maxDescriptionLength, "description");
    if (problem !== undefined) problems.add("description", problem);
  }
  if (!CATEGORIES.includes(manifest.category)) {
    problems.add("category", `must be one of ${CATEGORIES.join(", ")}`);
  }
  if (manifest.framework !== undefined && !FRAMEWORKS.includes(manifest.framework)) {
    problems.add("framework", `must be one of ${FRAMEWORKS.join(", ")}`);
  }
  if (manifest.tags !== undefined) {
    if (!Array.isArray(manifest.tags)) {
      problems.add("tags", "must be an array");
    } else {
      if (manifest.tags.length > limits.maxTags) {
        problems.add("tags", `contains more than ${limits.maxTags} tags`);
      }
      for (const [index, tag] of manifest.tags.entries()) {
        if (typeof tag !== "string" || !SLUG.test(tag)) {
          problems.add(`tags[${index}]`, "must be a lowercase slug");
        } else if (tag.length > limits.maxTagLength) {
          problems.add(`tags[${index}]`, `is longer than ${limits.maxTagLength} characters`);
        }
      }
    }
  }

  if (manifest.requires !== undefined) {
    if (!isRecord(manifest.requires)) {
      problems.add("requires", "must be an object");
    } else {
      checkKnownKeys(manifest.requires, new Set(["uvp", "libuvcpp", "features"]), "requires", problems);
      for (const key of ["uvp", "libuvcpp"]) {
        const value = manifest.requires[key];
        if (value !== undefined && (typeof value !== "string" || value.length === 0 || CONTROL.test(value))) {
          problems.add(`requires.${key}`, "must be a non-empty comparator string");
        }
      }
      if (manifest.requires.features !== undefined) {
        if (!Array.isArray(manifest.requires.features)) {
          problems.add("requires.features", "must be an array");
        } else {
          for (const [index, feature] of manifest.requires.features.entries()) {
            if (!FEATURES.includes(feature)) {
              problems.add(`requires.features[${index}]`, `must be one of ${FEATURES.join(", ")}`);
            }
          }
        }
      }
    }
  }

  if (manifest.variables !== undefined) {
    if (!isRecord(manifest.variables)) {
      problems.add("variables", "must be an object");
    } else {
      checkKnownKeys(manifest.variables, new Set(["name", "port"]), "variables", problems);
      if (manifest.variables.name !== undefined) {
        const value = manifest.variables.name;
        if (!isRecord(value) || value.type !== "slug") {
          problems.add("variables.name", "must be an object with type 'slug'");
        } else {
          checkKnownKeys(value, new Set(["type", "required", "default"]), "variables.name", problems);
        }
      }
      if (manifest.variables.port !== undefined) {
        const value = manifest.variables.port;
        if (!isRecord(value) || value.type !== "port") {
          problems.add("variables.port", "must be an object with type 'port'");
        } else {
          checkKnownKeys(value, new Set(["type", "required", "default"]), "variables.port", problems);
        }
      }
    }
  }

  const declared = new Map();
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    problems.add("files", "must be a non-empty array");
  } else {
    let declaredBytes = 0;
    if (manifest.files.length > limits.maxFiles) {
      problems.add("files", `contains more than ${limits.maxFiles} files`);
    }
    for (const [index, file] of manifest.files.entries()) {
      const location = `files[${index}]`;
      if (!isRecord(file)) {
        problems.add(location, "must be an object");
        continue;
      }
      checkKnownKeys(file, new Set(["path", "digest", "bytes"]), location, problems);
      const pathIssue = pathProblem(file.path, limits);
      if (pathIssue !== undefined) problems.add(`${location}.path`, pathIssue);
      if (typeof file.digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(file.digest)) {
        problems.add(`${location}.digest`, "must be 'sha256:' and 64 lowercase hex characters");
      }
      if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
        problems.add(`${location}.bytes`, "must be a non-negative integer");
      } else {
        if (file.bytes > limits.maxFileBytes) {
          problems.add(`${location}.bytes`, `is larger than ${limits.maxFileBytes} bytes`);
        }
        declaredBytes += file.bytes;
      }
      if (typeof file.path === "string") {
        const lower = file.path.toLowerCase();
        if (declared.has(lower)) problems.add(`${location}.path`, "collides with another declared path");
        else declared.set(lower, file);
      }
    }
    if (declaredBytes > limits.maxTotalBytes) {
      problems.add("files", `declares more than ${limits.maxTotalBytes} bytes`);
    }
  }

  const observedByPath = new Map(observed.map((file) => [file.path.toLowerCase(), file]));
  for (const [lower, file] of declared) {
    const seen = observedByPath.get(lower);
    if (seen === undefined) {
      problems.add(`files[${manifest.files.indexOf(file)}]`, `'${file.path}' was declared but not observed`);
      continue;
    }
    if (file.digest !== seen.digest) {
      problems.add(`files[${manifest.files.indexOf(file)}].digest`, "does not match the observed bytes");
    }
    if (file.bytes !== seen.bytes) {
      problems.add(`files[${manifest.files.indexOf(file)}].bytes`, "does not match the observed bytes");
    }
  }
  for (const file of observed) {
    if (!declared.has(file.path.toLowerCase())) {
      problems.add(`files/${file.path}`, "was observed but not declared in files[]");
    }
    if (file.binary && !(file.path === "assets" || file.path.startsWith("assets/"))) {
      problems.add(`files/${file.path}`, "is binary and outside assets/");
    }
  }

  if (manifest.license === undefined) {
    problems.add("license", "is required");
  } else if (!isRecord(manifest.license)) {
    problems.add("license", "must be an object");
  } else {
    checkKnownKeys(manifest.license, new Set(["spdx", "name", "file"]), "license", problems);
    const hasSpdx = typeof manifest.license.spdx === "string" && manifest.license.spdx.length > 0;
    const hasName = typeof manifest.license.name === "string" && manifest.license.name.length > 0;
    if (!hasSpdx && !hasName) problems.add("license", "needs 'spdx' or 'name'");
    if (hasSpdx) {
      if (!SPDX.test(manifest.license.spdx)) problems.add("license.spdx", "is not a single SPDX identifier");
      if (manifest.license.spdx.length > limits.maxSpdxLength) {
        problems.add("license.spdx", `is longer than ${limits.maxSpdxLength} characters`);
      }
    }
    if (hasName) {
      const problem = textProblem(manifest.license.name, limits.maxLicenseNameLength, "license.name");
      if (problem !== undefined) problems.add("license.name", problem);
    }
    if (manifest.license.file !== "LICENSE") {
      problems.add("license.file", "must be exactly 'LICENSE'");
    }
  }

  if (manifest.provenance === undefined) {
    problems.add("provenance", "is required");
  } else if (!isRecord(manifest.provenance)) {
    problems.add("provenance", "must be an object");
  } else {
    checkKnownKeys(
      manifest.provenance,
      new Set(["author", "source", "revision", "createdAt"]),
      "provenance",
      problems,
    );
    const authorProblem = textProblem(manifest.provenance.author, limits.maxAuthorLength, "provenance.author");
    if (authorProblem !== undefined) problems.add("provenance.author", authorProblem);
    if (!validateTimestamp(manifest.provenance.createdAt)) {
      problems.add("provenance.createdAt", "must be a UTC ISO-8601 timestamp with a real calendar date");
    }
    if (manifest.provenance.source !== undefined) {
      let url;
      try {
        url = new URL(manifest.provenance.source);
      } catch {
        url = undefined;
      }
      if (url === undefined || !["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") {
        problems.add("provenance.source", "must be an absolute http(s) URL without credentials");
      }
    }
    if (manifest.provenance.revision !== undefined) {
      const problem = textProblem(
        manifest.provenance.revision,
        limits.maxRevisionLength,
        "provenance.revision",
      );
      if (problem !== undefined) problems.add("provenance.revision", problem);
    }
  }

  if (manifest.preview !== undefined) {
    if (typeof manifest.preview !== "string" || !PREVIEW_NAMES.has(manifest.preview)) {
      problems.add("preview", "must be preview.png, preview.svg, or preview.webp");
    } else if (!names.has(manifest.preview)) {
      problems.add("preview", `names '${manifest.preview}', but the package does not contain it`);
    }
  }
  for (const preview of PREVIEW_NAMES) {
    if (names.has(preview) && manifest.preview !== preview) {
      problems.add(preview, "is present but not named by the manifest's preview field");
    }
  }

  if (manifest.routes !== undefined) {
    if (!Array.isArray(manifest.routes)) {
      problems.add("routes", "must be an array");
    } else {
      if (manifest.routes.length > limits.maxRoutes) {
        problems.add("routes", `contains more than ${limits.maxRoutes} routes`);
      }
      const seen = new Set();
      for (const [index, route] of manifest.routes.entries()) {
        if (typeof route !== "string" || !/^[A-Z][A-Z0-9-]* \/\S*$/u.test(route)) {
          problems.add(
            `routes[${index}]`,
            "must be 'METHOD /path' with an uppercase method and no whitespace in the path",
          );
          continue;
        }
        if (route.length > limits.maxRouteLength) {
          problems.add(`routes[${index}]`, `is longer than ${limits.maxRouteLength} characters`);
        }
        if (seen.has(route)) problems.add(`routes[${index}]`, `duplicates '${route}'`);
        seen.add(route);
      }
    }
  }
};

/** Read and preflight one package directory. Problems are reported, not thrown. */
export const readPackage = async (packageDir, limits = LIMITS) => {
  const problems = new Problems();
  const result = { ok: false, problems: problems.items, id: undefined, version: undefined, manifest: undefined, digest: undefined, files: [] };
  let entries;
  try {
    entries = await readdir(packageDir, { withFileTypes: true });
  } catch (error) {
    problems.add("package", `could not be listed: ${error.message}`);
    result.problems = problems.items;
    return result;
  }
  const names = new Set();
  for (const entry of entries) {
    names.add(entry.name);
    if (entry.name === "files") {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        problems.add("files", "must be a directory, not a link or a file");
      }
      continue;
    }
    if (!TOP_LEVEL_FILES.has(entry.name)) {
      problems.add(entry.name, "is not part of the package format");
      continue;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) {
      problems.add(entry.name, "must be a regular file");
    }
  }
  for (const required of ["template.json", "README.md", "LICENSE"]) {
    if (!names.has(required)) problems.add(required, "is required");
  }

  let manifest;
  try {
    const info = await stat(path.join(packageDir, "template.json"));
    if (info.size > limits.maxFileBytes) {
      problems.add("template.json", `is larger than ${limits.maxFileBytes} bytes`);
    } else {
      manifest = JSON.parse(await readFile(path.join(packageDir, "template.json"), "utf8"));
    }
  } catch (error) {
    problems.add("template.json", `could not be read: ${error.message}`);
  }
  if (manifest !== undefined && !isRecord(manifest)) {
    problems.add("template.json", "must contain an object");
    manifest = undefined;
  }

  let observed = [];
  if (names.has("files")) {
    observed = await walkFiles(path.join(packageDir, "files"), limits, problems);
  }
  if (manifest !== undefined) {
    validateManifest(manifest, observed, names, limits, problems);
  }

  result.ok = problems.length === 0;
  result.problems = problems.items;
  result.files = observed;
  if (manifest !== undefined) {
    result.id = manifest.id;
    result.version = manifest.version;
    result.manifest = manifest;
    result.digest = `sha256:${sha256Hex(canonicalJson(manifest))}`;
  }
  return result;
};

/** Scan a package directory for credential- and PII-shaped content. */
export const scanPackage = async (packageDir, limits = LIMITS) => {
  const rules = [
    { rule: "private_key", kind: "credential", pattern: /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/u, redact: () => "-----BEGIN … PRIVATE KEY-----" },
    { rule: "aws_access_key", kind: "credential", pattern: /\bAKIA[0-9A-Z]{16}\b/u, redact: (m) => `${m.slice(0, 4)}…` },
    { rule: "github_token", kind: "credential", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/u, redact: (m) => `${m.slice(0, 4)}…` },
    { rule: "slack_token", kind: "credential", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/u, redact: (m) => `${m.slice(0, 5)}…` },
    { rule: "provider_token", kind: "credential", pattern: /\bsk-[A-Za-z0-9]{20,}\b/u, redact: (m) => `${m.slice(0, 3)}…` },
    { rule: "secret_assignment", kind: "credential", pattern: /^\s*(?:export\s+)?([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*\S{8,}/u, redact: (_m, groups) => `${groups[0] ?? "…"}=…` },
    { rule: "home_path", kind: "pii", pattern: /\/(?:home|Users)\/[A-Za-z0-9._-]+\//u, redact: (m) => (m.startsWith("/Users/") ? "/Users/…/" : "/home/…/") },
    { rule: "email", kind: "pii", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u, redact: (m) => { const at = m.indexOf("@"); return `${m.slice(0, 1)}…${m.slice(at)}`; } },
    { rule: "phone", kind: "pii", pattern: /\+[1-9]\d{1,3}(?:[ .-]?\d{2,4}){2,4}\b/u, redact: (m) => `${m.slice(0, 1)}…` },
  ];
  const state = { scanned: [], skipped: [], findings: [], bytes: 0, entries: 0, truncated: false };
  const maxFindings = 200;

  const visit = async (directory, relative) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      state.skipped.push({ path: relative, reason: `could not be listed: ${error.message}` });
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.name === ".git") {
        state.skipped.push({ path: child, reason: "version-control metadata" });
        continue;
      }
      if (state.entries >= limits.maxFiles) {
        state.truncated = true;
        state.skipped.push({ path: child, reason: `the entry limit of ${limits.maxFiles} was reached` });
        continue;
      }
      state.entries += 1;
      if (entry.isSymbolicLink()) {
        state.skipped.push({ path: child, reason: "symbolic link (not followed)" });
        continue;
      }
      if (entry.isDirectory()) {
        await visit(path.join(directory, entry.name), child);
        continue;
      }
      if (!entry.isFile()) {
        state.skipped.push({ path: child, reason: "not a regular file" });
        continue;
      }
      if (state.findings.length >= maxFindings) {
        state.truncated = true;
        state.skipped.push({ path: child, reason: `the findings limit of ${maxFindings} was reached` });
        continue;
      }
      const target = path.join(directory, entry.name);
      let info;
      try {
        info = await lstat(target);
      } catch (error) {
        state.skipped.push({ path: child, reason: `could not be stat'ed: ${error.message}` });
        continue;
      }
      if (info.size > limits.maxFileBytes) {
        state.skipped.push({ path: child, reason: `larger than ${limits.maxFileBytes} bytes` });
        continue;
      }
      if (state.bytes + info.size > limits.maxTotalBytes) {
        state.truncated = true;
        state.skipped.push({ path: child, reason: `the scan budget of ${limits.maxTotalBytes} bytes is spent` });
        continue;
      }
      let content;
      try {
        content = await readFile(target);
      } catch (error) {
        state.skipped.push({ path: child, reason: `could not be read: ${error.message}` });
        continue;
      }
      state.bytes += content.byteLength;
      if (content.includes(0)) {
        state.skipped.push({ path: child, reason: "binary content (contains a NUL byte)" });
        continue;
      }
      state.scanned.push(child);
      const lines = content.toString("utf8").split(/\r?\n/u);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        for (const rule of rules) {
          const match = rule.pattern.exec(line);
          if (match === null) continue;
          state.findings.push({
            path: child,
            line: index + 1,
            rule: rule.rule,
            kind: rule.kind,
            redacted: rule.redact(match[0], match.slice(1)),
          });
          if (state.findings.length >= maxFindings) {
            state.truncated = true;
            break;
          }
        }
        if (state.findings.length >= maxFindings) break;
      }
    }
  };

  await visit(packageDir, "");
  return {
    scanned: state.scanned,
    skipped: state.skipped,
    findings: state.findings,
    truncated: state.truncated,
    limits: {
      maxFiles: limits.maxFiles,
      maxFileBytes: limits.maxFileBytes,
      maxTotalBytes: limits.maxTotalBytes,
      maxFindings,
    },
  };
};

/** Build the deterministic index from packages/<id>/<version>/. */
export const buildIndex = async (root, limits = LIMITS) => {
  const problems = new Problems();
  const packagesDir = path.join(root, "packages");
  const packages = [];
  let idEntries;
  try {
    idEntries = await readdir(packagesDir, { withFileTypes: true });
  } catch (error) {
    problems.add("packages", `could not be listed: ${error.message}`);
    return { problems: problems.items, index: { schema: REGISTRY_SCHEMA, packages } };
  }
  for (const idEntry of idEntries) {
    if (idEntry.name.startsWith(".") || idEntry.name === "README.md") continue;
    if (!idEntry.isDirectory() || idEntry.isSymbolicLink()) {
      problems.add(`packages/${idEntry.name}`, "must be an id directory");
      continue;
    }
    if (!SLUG.test(idEntry.name)) {
      problems.add(`packages/${idEntry.name}`, "id must be a lowercase slug");
      continue;
    }
    let versionEntries;
    try {
      versionEntries = await readdir(path.join(packagesDir, idEntry.name), { withFileTypes: true });
    } catch (error) {
      problems.add(`packages/${idEntry.name}`, `could not be listed: ${error.message}`);
      continue;
    }
    const versions = [];
    for (const versionEntry of versionEntries) {
      if (versionEntry.name.startsWith(".") || versionEntry.name === "README.md") continue;
      if (!versionEntry.isDirectory() || versionEntry.isSymbolicLink()) {
        problems.add(`packages/${idEntry.name}/${versionEntry.name}`, "must be a version directory");
        continue;
      }
      if (parseVersion(versionEntry.name) === undefined) {
        problems.add(`packages/${idEntry.name}/${versionEntry.name}`, "version must be SemVer 2.0.0");
        continue;
      }
      const packageDir = path.join(packagesDir, idEntry.name, versionEntry.name);
      const pkg = await readPackage(packageDir, limits);
      if (!pkg.ok) {
        for (const problem of pkg.problems) problems.add(`packages/${idEntry.name}/${versionEntry.name}`, problem);
        continue;
      }
      if (pkg.id !== idEntry.name) {
        problems.add(`packages/${idEntry.name}/${versionEntry.name}`, `id '${pkg.id}' does not match the directory`);
        continue;
      }
      if (pkg.version !== versionEntry.name) {
        problems.add(`packages/${idEntry.name}/${versionEntry.name}`, `version '${pkg.version}' does not match the directory`);
        continue;
      }
      versions.push({
        version: pkg.version,
        path: `packages/${idEntry.name}/${versionEntry.name}`,
        digest: pkg.digest,
        ...pkg.manifest,
        files: pkg.files,
      });
    }
    if (versions.length === 0) continue;
    versions.sort((a, b) => compareVersions(a.version, b.version));
    const latest =
      [...versions].reverse().find((entry) => parseVersion(entry.version).prerelease === undefined) ??
      versions[versions.length - 1];
    packages.push({ id: idEntry.name, latest: latest.version, versions });
  }
  packages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { problems: problems.items, index: { schema: REGISTRY_SCHEMA, packages } };
};

/** Pretty, deterministic text for index.json. */
export const renderIndex = (index) => `${JSON.stringify(sortValue(index), null, 2)}\n`;
