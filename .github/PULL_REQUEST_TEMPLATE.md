## Package

- Package: `<id>@<version>`
- Category / framework:
- What it demonstrates:
- Licence:
- Provenance:
- AI-assisted: no
- Human owner: none

<!--
AI-assisted must be exactly `yes` or `no`. When it is `yes`, replace
`Human owner: none` with the GitHub handle of the human who reviewed the
complete package and takes responsibility for it. An agent must not fill in a
human owner on someone else's behalf.
-->

## Scope

- [ ] One package version in this pull request; `id@version` is immutable.
- [ ] `files[]` declares every file under `files/` with its SHA-256 digest and
      byte count, and no unlisted file is delivered.
- [ ] Paths are relative and portable; no symlinks, archives, executables, or
      case collisions.
- [ ] Licence and provenance are present and truthful.
- [ ] No credentials and no personal data. PII-shaped scan findings are resolved
      or explained.
- [ ] The source builds with plain CMake against an installed libuvcpp and has
      no uvp runtime dependency.
- [ ] `requires` names the libuvcpp features the package actually needs.
- [ ] `index.json` was regenerated (`node scripts/build-index.mjs --write`).

## Evidence

- [ ] `node scripts/build-index.mjs --check` — result:
- [ ] `node scripts/validate-packages.mjs` — result:
- [ ] `node --test` — result:
- [ ] Runtime evidence (validate/import/init/build) — result, or the named lane
      that could not run and why.
- [ ] The README's claims match what the package actually does.

## Author readiness (human owner)

The human owner completes this section. An agent must not check these boxes or
attest to human review on the owner's behalf.

- [ ] I reviewed the complete diff and the package contents, understand the
      edge cases, and take responsibility for the submission, including
      AI-assisted work.
- [ ] I checked the evidence above, confirmed it supports the current commit,
      and recorded what remains unknown.
- [ ] I declare this pull request ready for maintainer review.

## Before merge

- [ ] CI is green on the current head.
- [ ] No unresolved review finding remains.
- [ ] Any PII scan finding is resolved or explicitly accepted by the maintainer.
- [ ] The approval names this pull request and this commit; a new commit makes it
      stale.
