# uvp templates

The official registry of [uvp](https://github.com/Antruly/uvp) template
packages. uvp is the client: it validates, stores, searches, and renders a
package locally. This repository is the **data and the review process** — a
standard `uvp.template/1` package tree, a deterministic index, and CI that
checks every submission.

The package format is owned by uvp, not by this repository. The authoritative
description is uvp's [`docs/template-packages.md`](https://github.com/Antruly/uvp/blob/main/docs/template-packages.md).
If this repository and uvp disagree, uvp wins; that is a bug here.

## Status

Bootstrap. The following is observed, not assumed:

- uvp's template-package schema and validator landed in
  [uvp#244](https://github.com/Antruly/uvp/pull/244) and
  [uvp#245](https://github.com/Antruly/uvp/pull/245).
- The latest published `uvp-agents` is **0.2.0** (observed 2026-10-18) and does
  not expose the template commands: `uvp template validate --help` answers
  `No command named "template"`. The local store, search, export, and scan are
  being reviewed in [uvp#236](https://github.com/Antruly/uvp/issues/236).
- This repository therefore runs the **structural** lanes today: package shape,
  paths, limits, digests, licence/provenance, a bounded secret/PII scan, and
  index determinism.
- The **runtime** lane — install the latest published uvp, validate/import the
  package, generate a workspace, build it against libuvcpp, and run it — is
  present but gated. It activates when the published uvp exposes the template
  commands. Until then, no package is described as build-verified.

A green structural run is evidence about the package's bytes and metadata. It is
not evidence that the generated C++ builds or runs.

## Layout

```text
packages/<id>/<version>/
  template.json          the uvp.template/1 manifest
  README.md              what the package is and how to use it
  LICENSE                the licence named by the manifest
  preview.(png|svg|webp) optional preview
  files/                 the source tree, relative paths only
index.json               generated from packages/; never edited by hand
```

`packages/<id>/<version>` is immutable. A change is a new version; replacing an
existing one is not a merge this repository accepts.

## Submit a package

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the uvp package format.
2. Add `packages/<id>/<version>/` with the manifest, README, licence, and source
   tree.
3. Run the same checks CI runs:

   ```bash
   node scripts/build-index.mjs --write
   node scripts/validate-packages.mjs
   node --test
   ```

4. Open one pull request for one package version. Complete the PR template,
   including the AI-assistance disclosure and the human owner when applicable.

CI must pass, and a **human owner** must approve the final commit. A green run
is evidence; it is not approval.

## Index

The index is generated and deterministic:

- raw:
  `https://raw.githubusercontent.com/Antruly/uvp-templates/main/index.json`
- format: [docs/index-format.md](docs/index-format.md)

No timestamps, no model calls, and no executable content are present in the
index. Versions are immutable.

## Rules

The short version; the normative documents are [AGENTS.md](AGENTS.md),
[CONTRIBUTING.md](CONTRIBUTING.md), and [docs/review-policy.md](docs/review-policy.md).

- A package is **data, not code**. Nothing in a package runs at search or index
  time.
- Every file is declared with a SHA-256 digest and byte count. No symlinks, no
  archives, no executables, no path traversal.
- Licence and provenance are required. A package without them is rejected.
- Credential-shaped content fails CI; PII-shaped content is reported for a human
  to resolve.
- AI-assisted submissions are welcome and must name a human owner who takes
  responsibility. Agents never approve or merge their own work.
- The runtime lane executes submitted C++ on an ephemeral runner with no
  secrets. It runs only after a maintainer applies the `runtime-check` label.

## Licence

The registry's tooling and documents are MIT ([LICENSE](LICENSE)). Each package
declares its own licence in its manifest and carries its own `LICENSE` file;
submitting a package grants this registry the right to distribute it under that
licence.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md). Do
not open a public issue for a credential leak.
