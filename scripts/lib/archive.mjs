import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * The deterministic package archive.
 *
 * One tarball per immutable `id@version`, built from the package directory so a
 * client can fetch one object instead of reconstructing a tree from the index.
 * The bytes are a contract: the same tree must produce the same `.tgz` on any
 * run, or the digest in `index.json` stops meaning anything.
 *
 * Determinism comes from writing the tar ourselves rather than delegating to
 * the host `tar`: paths sorted bytewise, mode 0644, uid/gid 0, mtime 0, no user
 * or group names, ustar format, and gzip with no timestamp (`gzipSync` does not
 * write the current time). The package validator has already refused symlinks,
 * executables and path traversal, so this walk may assume regular files.
 */

const BLOCK = 512;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const writeString = (target, offset, length, value) => {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) {
    throw new Error(`value is ${bytes.length} bytes and does not fit ${length}: ${value}`);
  }
  bytes.copy(target, offset);
};

const octal = (value, width) => `${value.toString(8).padStart(width - 1, "0")}\0`;

/**
 * Split a path into the ustar `prefix` and `name` fields.
 *
 * `name` holds at most 100 bytes and `prefix` at most 155. A short path stays in
 * `name`; a longer one is split at a slash, from the right, so the name keeps
 * the deepest component that fits. A path that cannot be split is refused
 * rather than silently truncated.
 */
const splitUstarPath = (relative) => {
  if (Buffer.byteLength(relative, "utf8") <= 100) return { name: relative, prefix: "" };
  const parts = relative.split("/");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const prefix = parts.slice(0, index).join("/");
    const name = parts.slice(index).join("/");
    if (Buffer.byteLength(name, "utf8") <= 100 && Buffer.byteLength(prefix, "utf8") <= 155) {
      return { name, prefix };
    }
  }
  throw new Error(`path is too long for ustar: ${relative}`);
};

const headerFor = (relative, size) => {
  const { name, prefix } = splitUstarPath(relative);
  const header = Buffer.alloc(BLOCK);

  writeString(header, 0, 100, name);
  writeString(header, 100, 8, octal(0o644, 8)); // mode
  writeString(header, 108, 8, octal(0, 8)); // uid
  writeString(header, 116, 8, octal(0, 8)); // gid
  writeString(header, 124, 12, octal(size, 12));
  writeString(header, 136, 12, octal(0, 12)); // mtime: 1970-01-01T00:00:00Z
  header[156] = 0x30; // regular file
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);

  // The checksum is computed with its own field as spaces, then written as six
  // octal digits, NUL, space.
  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
};

const walk = async (root, relative = "") => {
  const directory = relative === "" ? root : path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  const files = [];
  for (const entry of entries) {
    const entryPath = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`the package contains a symlink: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await walk(root, entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw new Error(`the package contains a special file: ${entryPath}`);
    }
  }
  return files;
};

/** Build the tarball for one package directory. */
export const archivePackage = async (packageDirectory, id, version) => {
  const files = await walk(packageDirectory);
  const chunks = [];
  let total = 0;

  for (const relative of files) {
    const content = await readFile(path.join(packageDirectory, relative));
    const header = headerFor(relative, content.length);
    chunks.push(header, content);
    total += header.length + content.length;
    const padding = (BLOCK - (content.length % BLOCK)) % BLOCK;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      total += padding;
    }
  }

  // End-of-archive marker: two zero blocks.
  chunks.push(Buffer.alloc(BLOCK * 2));
  total += BLOCK * 2;

  const tar = Buffer.concat(chunks, total);
  const bytes = gzipSync(tar, { level: 9 });
  return {
    path: `archives/${id}/${version}.tgz`,
    bytes: bytes.length,
    digest: `sha256:${sha256(bytes)}`,
    archive: bytes,
  };
};
