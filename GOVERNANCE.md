# Governance

This repository is small and has a deliberately simple decision process. This
document says who decides what, and what evidence a decision needs.

## Roles

**Maintainer.** Merges to `main`, manages labels and branch protection, and
holds the final say on what the registry accepts. The maintainer is the only
role that can approve a submission involving a security-sensitive change, a
licence exception, or a package removal.

**Reviewer.** Independently checks a submission against the package format, the
scan result, and the claims in its README. A reviewer may request changes; a
reviewer does not rewrite the submission or approve it on the maintainer's
behalf.

**Human owner.** The person responsible for a package and its complete pull
request, including AI-assisted work. Every submission has exactly one human
owner. For a human-authored submission the author is the owner unless another
human accepts ownership on the PR.

**Contributor.** Anyone who opens an issue or a pull request. Proposing is open;
integration is gated by review and approval.

## Decisions

| Decision                                              | Process                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| A package version                                     | One pull request, CI, human approval, immutable after merge    |
| A registry tooling or documentation fix               | One pull request, CI, human approval                            |
| A format change                                       | Proposed in uvp, not here; this repository follows uvp          |
| A package removal                                     | Pull request with the security/licence/legal reason, maintainer |
| A new required CI lane or branch-protection change    | Maintainer decision, recorded in the PR or issue               |
| A licence exception for a package                     | Maintainer decision, recorded                                     |

## Evidence standards

A decision — approval, rejection, or deferral — rests on:

- **Evidence.** Which lanes ran, what they observed, what was skipped, and what
  remains unknown. A structural pass is not a build pass.
- **Scope fit.** Whether the package is data the registry can distribute, not a
  service or a runtime.
- **Honesty of the output.** Whether the submission preserves the distinction
  between observed, derived, and unknown.

A submission that reports coverage it did not have is not approvable, even if CI
is green.

## AI-assisted work

AI-assisted submissions are welcome. A human owner is mandatory, the PR discloses
AI assistance, and the human owner reviews the complete diff. An AI agent never
approves, merges, or attests to human review. A green run is evidence, not
approval.

The human approval is recorded in a comment naming the PR and the reviewed
commit. GitHub's required-approval count is not used: the project has one human
maintainer, who cannot self-approve a GitHub review, and agent accounts must not
approve. Branch protection enforces the PR flow and the required `validate`
check; it does not replace the recorded approval.

The detailed workflow follows
[uvp's agent workflow](https://github.com/Antruly/uvp/blob/main/docs/agent-workflow.md).

## Removal and yanking

A published version is immutable. It may be removed only for a security, licence,
or legal problem. Removal deletes the version directory and regenerates
`index.json`; clients that already downloaded a pinned version keep their copy.
The reason is recorded in the pull request and, where appropriate, a security
advisory.

## Disagreement

Disagreement is welcome and should be specific: name the claim, the evidence
against it, and what would change your mind. The maintainer records the reasoning
in the thread. A disagreement that cannot be resolved on evidence is resolved by
the maintainer, with the reasoning recorded either way.

## Fail closed

When a scope, authority, licence, or verification question is unresolved, the
answer is no for this submission. Record the question and the next probe. Do not
merge "probably fine".
