# Packages

Add one directory per package version:

```text
packages/<id>/<version>/
```

Read [CONTRIBUTING.md](../CONTRIBUTING.md) and
[docs/package-format.md](../docs/package-format.md) first. Regenerate the index
after adding a package:

```bash
node scripts/build-index.mjs --write
node scripts/validate-packages.mjs
node --test
```

There are no packages yet. The first submissions wait for the published uvp to
expose the template commands so the runtime lane can report build evidence; a
structural pass alone is not a build claim. See the README status section.
