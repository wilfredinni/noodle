# Homebrew core preparation

Target: Noodle v0.9.8. The current binary tap remains active. Core submission,
acceptance, bottles, and tap migration are pending maintainer checkpoints.

## Build and validation

`bun run build:homebrew --opentui-source <extracted-opentui-source> --zig <zig-0.16.0> --cc <host-compiler>`
installs the frozen dependency set, rebuilds both native assets, checks the
embedded asset set, signs on macOS, and tests compiled QuickJS. Run this in an
extracted Noodle source tree: it replaces the host addon and installed OpenTUI
library in that tree. Linux builds target glibc. The normal cross-platform
release builder remains separate.

The formula template and Unix CI pin OpenTUI v0.5.17 with SHA-256
`f272f54f96ff230a188c9cf9f593105c6e784f0a14fdbcb7169e523d9c9b7a96`.
When changing the locked OpenTUI version, update both pins and verify its native
toolchain requirements. Portable JavaScript/WASM dependencies stay locked;
platform-specific native output is rebuilt.

Revalidated on 2026-10-05 on macOS ARM64: archive build without `.git`, freshly
extracted OpenTUI source, exactly two rebuilt native assets in the compile
metadata, signing, compiled QuickJS, native-response/worker integration tests,
formula style, and the actual formula test harness against an isolated
source-built prefix. The full release check passed with 4,022 tests passed,
41 skipped, and no failures; Astro reported no errors, warnings, or hints.
TUI and security reviews found no actionable issues. A regression covers explicit
glibc selection when Linux runtime metadata is missing. Intel/Linux execution and
final published-source formula installation/audit still require validation.

## Publish, then prepare the final formula

1. Review the Noodle and site diffs and validation evidence. Publish v0.9.8 from
   successful CI at the release commit using the existing release workflow.
2. Download the immutable published source archive:

   ```bash
   curl --fail --location https://github.com/wilfredinni/noodle/archive/refs/tags/v0.9.8.tar.gz -o /tmp/noodle-0.9.8.tar.gz
   ```

3. Fork `Homebrew/homebrew-core`, create a branch from its current default branch,
   and generate `Formula/n/noodle.rb` in that checkout:

   ```bash
   bun scripts/prepare-homebrew-formula.ts --archive /tmp/noodle-0.9.8.tar.gz --outfile /path/to/homebrew-core/Formula/n/noodle.rb
   ```

   The generator computes the actual archive checksum. `--local` generates a
   temporary `file:` source URL for development only; never submit that version.

4. Run the final checks in the core checkout:

   ```bash
   HOMEBREW_NO_INSTALL_FROM_API=1 brew install --build-from-source noodle
   brew test noodle
   brew audit --strict --online --new noodle
   brew style noodle
   brew lgtm --online
   ```

   Current Homebrew uses `--new` for new-formula audits. Do not check off source
   installation or these checks based on the standalone archive build alone.

5. Personally review the formula and submit `noodle 0.9.8 (new formula)` using
   the core PR template. Disclose Codex and the model used, do not add AI commit
   attribution, and personally answer maintainer questions without AI. Follow
   [Homebrew's submission instructions](https://docs.brew.sh/How-To-Open-a-Homebrew-Pull-Request).

The formula test uses an isolated home, creates and inspects a collection, and
validates embedded QuickJS/crypto with an expected script failure before HTTP.

## Acceptance and migration

- Verify Homebrew CI, bottles, fresh core installation, TUI startup, and update
  guidance before advertising official availability.
- Add `{"noodle":"homebrew/core"}` to the old tap's `tap_migrations.json`, remove
  its formula, and disable its Update Formula automation. Keep the repository.
- Remove Noodle's `notify-homebrew` release job and all notification/recovery
  references only after migration is available. Update installation docs.
- Test a tap-to-core upgrade with existing collections, configuration, and agent
  skills. Refresh the managed skill explicitly with `noodle agent install`.
- Verify future formula releases through livecheck or `brew bump-formula-pr`.

## Release skill audit

- `noodle-dev`: changed in this preparation for Homebrew guidance; its async test
  reference also changed since v0.9.7.
- `noodle-release`: changed since v0.9.7 for CI artifact reuse and publication
  recovery; no additional skill edits needed.
- `noodle-use`: changed in this preparation for current installation guidance;
  local development examples also changed since v0.9.7. Collection, scripting,
  and automation contracts remain the same.
- `opentui`: unchanged; existing standalone guidance covers the selected source
  build and libc definition.
- `Tips.tsx`: unchanged; its existing update/About tip remains accurate.

The update manifest schema and cache headers remain unchanged. Keep the current
site release manifest until publication updates it through the release workflow.
