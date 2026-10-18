# Contributing to uvp templates

This repository accepts template packages for uvp, and improvements to the
registry's checks and documentation. The package format is owned by
[uvp](https://github.com/Antruly/uvp); read its
[`docs/template-packages.md`](https://github.com/Antruly/uvp/blob/main/docs/template-packages.md)
before authoring a package.

## What to contribute

- A package that demonstrates a capability the existing catalogue does not
  (a libuvcpp feature, a frontend skin, a service shape).
- A new version of a package you own.
- A fix to the registry's preflight checker, index builder, CI, or docs, with a
  test.
- A security or correctness report, privately if it involves a credential.

A new package **format** change is not a contribution here. Propose it in uvp,
where the format is owned.

## Package layout

```text
packages/<id>/<version>/
  template.json          uvp.template/1 manifest
  README.md              what it is and how to use it
  LICENSE                the licence named by the manifest
  preview.(png|svg|webp) optional; named by the manifest
  files/                 the source tree delivered into a generated workspace
```

`id` is a lowercase slug; `version` is SemVer 2.0.0. The pair is immutable. The
manifest's `files[]` lists every file under `files/` exactly once, with its
SHA-256 digest and byte count.

Source requirements:

- plain CMake against an installed libuvcpp, nothing else;
- no uvp runtime dependency and no dependency on a file outside the generated
  workspace;
- no symlinks, archives, executables, object files, or case-colliding paths;
- binary assets only under `assets/`;
- no credentials and no personal data;
- a declared licence, provenance, and (when relevant) the libuvcpp features the
  package requires.

## Local checks

Node 24 is pinned in `.nvmrc`. There are no npm dependencies.

```bash
node scripts/build-index.mjs --write   # regenerate index.json
node scripts/build-index.mjs --check   # what CI runs
node scripts/validate-packages.mjs     # package preflight + scan
node --test                            # the registry's own tests
```

A package that fails the scan for a credential-shaped value is not accepted. A
PII-shaped finding is reported; resolve it or explain in the PR why it is
intentional and safe. The scan is heuristic and bounded: "no findings" means
"these patterns did not match the bytes that were read", not "clean".

## Submitting

1. Branch from `main`, for example `add/acme-dashboard-1.2.0`.
2. Add one package version. Do not edit an existing `id@version`; publish a new
   version instead.
3. Run the local checks and commit the regenerated `index.json`.
4. Open one pull request. Fill in the PR template:
   - package id and version;
   - what the package demonstrates;
   - licence and provenance;
   - `AI-assisted: yes|no`;
   - a **human owner** when AI-assisted.
5. Wait for CI and review. The required `validate` workflow must pass.

Do not mark a PR ready or ask for approval while a check is red or a question is
unresolved.

## AI-assisted submissions

AI-assisted work is welcome. It is held to the same bar, and one additional rule:
a human must own it.

- The PR declares `AI-assisted: yes` and names a human owner.
- The human owner reviews the complete package and takes responsibility for it.
- An AI agent must not approve, merge, or complete the human-owner declaration.
- The maintainer's approval is the human confirmation required for merge.

A submission that omits the declaration, or names no human owner while being AI
assisted, fails the PR-policy check.

## Review

A reviewer checks, at minimum:

- the package format, digest list, paths, limits, and licence/provenance;
- the scan result, and every PII finding;
- whether the README makes claims the package does not support;
- whether `requires` is truthful;
- the build evidence, when the runtime lane is available. When it is not, the PR
  says so; a structural pass is not presented as a build pass.

The maintainer approves a specific commit. A new commit makes the approval
stale. The merge is a merge commit; `main` is protected.

## Immutability, updates, and removal

- Published `id@version` entries are immutable.
- An update is a new version with a new manifest, digest list, and index entry.
- A package is removed only for a security, licence, or legal problem. Removal
  deletes the version and regenerates the index; it does not rewrite history for
  clients that already downloaded a pinned version. The reason is recorded in the
  pull request and, where appropriate, a security advisory.

## Licensing

The registry's tooling and documents are MIT. Each package declares its own
licence and carries its own `LICENSE` file. By submitting a package you confirm
that you have the right to distribute it under that licence and grant this
registry permission to do so.

## Security

Do not disclose a credential or an exploitable package publicly. Follow
[SECURITY.md](SECURITY.md).
