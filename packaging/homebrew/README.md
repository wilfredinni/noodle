# Homebrew distribution

Noodle v0.9.8 was accepted into Homebrew core on October 11, 2026 in
[PR #315918](https://github.com/Homebrew/homebrew-core/pull/315918).
The [official formula](https://formulae.brew.sh/formula/noodle) is the source of
truth for published versions, supported bottles, and dependencies.

## Installation and migration

New users run `brew install noodle`. Existing `wilfredinni/noodle` users run:

```bash
brew update
brew reinstall noodle
brew untap wilfredinni/noodle
```

Homebrew transfers the tap ownership during `brew update`. Reinstall once to
replace the old tap binary with the official build even at the same version;
untap only after that succeeds. Collections, configuration, and agent skills
are preserved. Refresh a managed skill explicitly with `noodle agent install`.
Future updates use `brew upgrade noodle`.

The old tap keeps `tap_migrations.json` with `{"noodle":"homebrew/core"}`.
Its formula and Update Formula workflow are removed. Keep that repository
available so installations that have not updated yet can still migrate.

## Future releases

Noodle's release workflow publishes its validated binaries and website update
manifest. Homebrew core updates are maintained independently; there is no tap
dispatch or Homebrew stage in publication recovery.

After publishing a release, check the official formula and existing Homebrew
update PRs. If a manual bump is needed, the maintainer can use
[`brew bump-formula-pr`](https://docs.brew.sh/How-To-Open-a-Homebrew-Pull-Request#submit-a-new-version-of-an-existing-formula).
Review and test the formula before submitting, disclose AI assistance when
applicable, and answer Homebrew reviewers personally.

Update the existing core formula rather than replacing it with this repository's
template: preserve Homebrew's bottle block, runtime dependencies, and maintainer
changes. In particular, Linux builds require `icu4c@78`. The template is a local
source-build aid, not an automatic publisher.

## Native source builds

`bun run build:homebrew --opentui-source <extracted-opentui-source> --zig <zig-0.16.0> --cc <host-compiler>`
installs the frozen dependency set, rebuilds both native assets, checks the
embedded asset set, signs on macOS, and tests compiled QuickJS. Run this in an
extracted Noodle source tree: it replaces the host addon and installed OpenTUI
library in that tree. Linux builds target glibc. The normal cross-platform
release builder remains separate.

The released v0.9.8 formula uses OpenTUI v0.5.14. The development template and
Unix CI now pin OpenTUI v0.5.17 with SHA-256
`f272f54f96ff230a188c9cf9f593105c6e784f0a14fdbcb7169e523d9c9b7a96`.
When changing the locked OpenTUI version, update the formula's checksummed
resource and verify its Zig toolchain requirements. Never pair a new resource
with an older release archive or replace immutable release assets.

Bun dependencies are fetched before installation into `buildpath/bun-cache`;
`build:homebrew --offline` uses that prepared cache. Native dependencies are
rebuilt from source, while JavaScript and WASM dependencies remain locked.

For a formula update, validate the published source in a Homebrew core checkout:

```bash
HOMEBREW_NO_INSTALL_FROM_API=1 brew reinstall --build-from-source noodle
brew test noodle
brew audit --strict --online noodle
brew style noodle
brew lgtm --online
```

The formula test creates and inspects a collection in Homebrew's isolated test
home and exercises embedded QuickJS/crypto before HTTP. Also run
`NOODLE_TEST_SCRIPT_DIAGNOSTICS=1 noodle`, check TUI startup, and verify that
`noodle update --json` and `--force` report `homebrew_managed` with
`brew upgrade noodle` without changing the binary or installed skills.
