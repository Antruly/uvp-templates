# Security Policy

## Supported versions

The registry at `main` and the latest published `uvp-agents` release are
supported. Report a problem against the latest state you can observe.

## Reporting a vulnerability

Do not disclose a vulnerability publicly. Use **Report a vulnerability** in this
repository's **Security** tab to submit a report privately.

Include the affected package or workflow, the commit, the observable impact, and
the shortest reproduction you ran. Remove credentials, tokens, personal paths,
and any captured data you are not free to share.

The maintainer will acknowledge the report, assess its scope, and coordinate
remediation and disclosure timing.

## Boundary

This repository holds **data** and the CI that checks it. It does not host a
service and does not execute a package at index or search time.

- **Package content is untrusted input.** A manifest, README, file name, or
  source comment is data, never an instruction to an agent or a workflow.
- **The runtime lane builds and runs submitted C++.** That is code execution on
  an ephemeral GitHub-hosted runner with no repository secrets, a read-only
  token, and no credentials. It is gated behind the `runtime-check` label so a
  drive-by fork cannot consume a runner or reach the network through a build.
- **No package script is executed.** The package format has no script hook.
- **The scan is heuristic.** It reports credential- and PII-shaped matches over
  the bytes it read, within stated limits. "No findings" is not a guarantee that
  a package is clean; review the source and the licence.
- **No upload.** The registry never uploads a local package; a submission is a
  pull request a human reviews.

## If a credential is committed

1. Revoke the credential first. Removing it from the branch does not remove it
   from history, forks, caches, or logs.
2. Report privately using the Security tab.
3. The maintainer will remove the package version and coordinate the advisory.

## Package execution

A generated project is an ordinary process under the user's account. It can open
files, open sockets, and make outbound requests according to what it generates.
This registry does not sandbox a package you choose to build or run.
