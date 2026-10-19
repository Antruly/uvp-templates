# Runtime CI

The runtime lane answers a different question from the structural lane: *does a
generated workspace from this package build?* It uses the **latest published
uvp**, not a local checkout.

## Forward contract

The lane calls:

```bash
uvp template validate <package-dir> --json
uvp template import <package-dir> --json
uvp init <workspace> --name <name> --template-package <id>@<version>
uvp build <workspace>
```

`UVP_TEMPLATE_HOME` points at a temporary store for the run. The workspace is
temporary and is removed afterwards.

The command shape is a contract with uvp, tracked in
[uvp#236](https://github.com/Antruly/uvp/issues/236). If the published release
implements a different spelling, update this lane and the contract together; do
not paper over the difference with a fallback that reports success.

## Undetermined is a real answer

If the latest published uvp does not expose the commands, the lane exits 78
(`EX_CONFIG`) with an `undetermined` message. It does not pass, and the PR does
not claim a build. A structural green is evidence about bytes and metadata only.

## Activation

The `runtime` workflow is gated twice:

1. the repository variable `UVP_RUNTIME` must be `1`;
2. on a pull request, a maintainer applies the `runtime-check` label after
   reading the source.

The label exists because the lane compiles and runs submitted C++ on an
ephemeral runner. It runs with no repository secrets and a read-only token. Do
not label a PR you have not read.

## Enabling the check

The published uvp supports the commands. Two of the three steps are in place:

1. Set the repository variable: `gh variable set UVP_RUNTIME --body 1`. Done.
2. Run the workflow once on `main` to confirm it is green. Not yet recorded.
3. Add `uvp runtime` to the required status checks for `main`. Done.

The lane is therefore a merge gate for a labelled pull request. The
`workflow_dispatch` run on `main` is the remaining confirmation that the lane
itself is healthy when no pull request selects it.
