# Package format

The authoritative format is uvp's
[`docs/template-packages.md`](https://github.com/Antruly/uvp/blob/main/docs/template-packages.md)
and its schema `uvp.template/1`. This page records only what the registry adds
on top of it and what its preflight checks.

## Registry layout

```text
packages/<id>/<version>/
  template.json
  README.md
  LICENSE
  preview.png | preview.svg | preview.webp   optional
  files/
    ...                                      the delivered source tree
```

- `id` is a lowercase slug, at most 64 characters.
- `version` is SemVer 2.0.0. A version is immutable once merged.
- Every file under `files/` is declared exactly once in `template.json`'s
  `files[]`, with its `sha256:` digest and byte count.
- The manifest's `license` names the `LICENSE` file; `provenance` is required.
- No symlinks, hard links, archives, executables, object files, or case
  collisions. Binary assets belong under `assets/`.

## What the registry preflight checks

`scripts/lib/package.mjs` implements the subset the registry needs:

- the required files and the closed manifest field set;
- SemVer, the id slug, categories, frameworks, tags, and features;
- path portability and the named limits;
- the two-way `files[]`/`files/` check, digests, byte counts, and binary
  placement;
- licence, provenance, timestamp, and source URL shape;
- optional `routes` entries (`METHOD /path`, at most 64, unique);
- a bounded credential/PII scan (see [review-policy.md](review-policy.md)).

## What it does not establish

- That the package renders into a working workspace. That is the runtime lane.
- That the generated C++ builds or runs. The runtime lane reports that, and only
  when the published uvp exposes the template commands.
- That an SPDX identifier exists in the SPDX database.
- That a `requires` range is satisfied by the installed libuvcpp.
- That the scan found everything. It reports the files it read and the files it
  skipped; "no findings" is not "clean".

When uvp publishes `uvp template validate`, that command becomes the format
authority and the preflight above is reduced to a pre-check.
