# Index format

`index.json` is generated from `packages/` by `scripts/build-index.mjs`. It is
deterministic: no timestamps, sorted ids, sorted versions, sorted object keys.
Do not edit it by hand.

```json
{
  "schema": "uvp.registry/1",
  "packages": [
    {
      "id": "acme-dashboard",
      "latest": "1.2.0",
      "versions": [
        {
          "version": "1.2.0",
          "path": "packages/acme-dashboard/1.2.0",
          "digest": "sha256:…",
          "name": "Acme dashboard",
          "description": "A dashboard service",
          "category": "fullstack",
          "framework": "h5",
          "tags": ["dashboard"],
          "requires": { "uvp": ">=0.3.0", "features": ["websocket"] },
          "license": { "spdx": "MIT", "file": "LICENSE" },
          "provenance": { "author": "Acme", "createdAt": "2026-10-18T00:00:00Z" },
          "files": [
            { "path": "src/main.cc", "digest": "sha256:…", "bytes": 1234 }
          ]
        }
      ]
    }
  ]
}
```

## Fields

- `schema` is `uvp.registry/1`.
- `packages[].id` is the package id.
- `packages[].latest` is the highest SemVer release, excluding prereleases when
  a release exists. If only prereleases exist, it is the highest prerelease.
- `packages[].versions[]` is sorted by SemVer precedence, ascending. Build
  metadata does not affect precedence.
- `path` is the repository-relative package directory.
- `digest` is `sha256:` over the manifest's canonical JSON (RFC 8785-style:
  sorted keys, no whitespace), the same rule uvp uses.
- `files[]` repeats the verified manifest list: path, digest, and byte count.

## URL

```text
https://raw.githubusercontent.com/Antruly/uvp-templates/main/index.json
```

The index contains metadata only. It does not contain file bytes and it does not
execute anything. A client that downloads a package verifies its files against
the manifest it receives.

## Checking

```bash
node scripts/build-index.mjs --check   # fails when index.json is stale
node scripts/build-index.mjs --write   # regenerates it
```
