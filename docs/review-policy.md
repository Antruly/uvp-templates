# Review policy

Every submission has one human owner. A green CI run is evidence; it is not
approval.

## Required checks

| Check | What it establishes | What it does not |
| --- | --- | --- |
| `validate` workflow | package shape, paths, limits, digests, licence/provenance, scan, index, tests, disclosure | that the package builds or runs |
| `runtime` workflow | validate/import/init/build using the latest published uvp | that the service answers correctly under load |
| Human review | the complete diff and the claims in the README | a substitute for a lane that did not run |

The `runtime` lane is gated by the repository variable `UVP_RUNTIME=1` and the
`runtime-check` label. It is off while the published uvp does not expose the
template commands; a structural pass is never presented as a build pass.

## What a reviewer checks

- The manifest and `files[]` match the tree, and the digests were recomputed.
- Paths are portable and no symlink, archive, executable, or case collision is
  present.
- Licence and provenance are present, plausible, and consistent with the source.
- Every PII scan finding is resolved or explicitly accepted by the maintainer.
- `requires` names the libuvcpp features the source actually uses.
- The README does not claim a capability the package does not have.
- The build evidence is current for the reviewed commit.

## AI-assisted submissions

- The PR declares `AI-assisted: yes` and names a human owner.
- The human owner reviews the complete package and completes the readiness
  declarations. An agent never fills those in.
- An agent never approves, merges, or attests to human review.
- The maintainer's approval is the human confirmation required for merge.

The `check-pr-policy` step fails when the declaration is missing or when an
AI-assisted PR names no human owner. It is a disclosure gate, not an identity
check; branch protection and the human approval are the actual gate.

## Approval and merge

1. The PR is ready only when the `validate` lane passes on the current head and
   no blocking finding remains.
2. The human owner completes the readiness declarations.
3. The maintainer approves that PR at that commit, in a comment naming the PR and
   the commit. A new commit makes the approval stale.
4. The merge is a merge commit into `main`. `main` is protected: required
   `validate` check, conversation resolution, no direct pushes, no force pushes,
   no deletion.

GitHub's required-approval count is deliberately not used. The project has one
human maintainer, GitHub does not allow self-approval, and agent accounts must
not submit an approval. The human gate is the recorded approval comment plus the
readiness declaration; branch protection enforces the PR flow and the required
check. A second human reviewer is welcome and should be recorded in the same
way.

## Removal

A published version is immutable. Remove it only for a security, licence, or
legal problem, with the reason recorded in the pull request. Removal deletes the
version and regenerates the index; pinned clients keep their copy.
