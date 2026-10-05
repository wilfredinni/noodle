# Response file native operations

This private Node-API 8 addon pins response output directories and creates each
new component relative to an open directory without following symbolic links.
It is used by both CLI downloads and TUI Save As. Existing directory aliases are
resolved during preparation; new directories and files are created only when a
completed response is saved. The native I/O uses asynchronous work so it does not
block the terminal UI.

Prebuilds are checked into this repository for the same eight targets as OpenTUI:
macOS and Windows x64/arm64, and Linux x64/arm64 with glibc/musl. Literal requires
in the loader allow Bun to embed the addons in standalone executables. Normal
installation, development and binary builds require no extra tools or downloads.
No pathname-based fallback is used.

Maintainers regenerate prebuilds with Zig **0.15.2**:

```sh
bun scripts/build-response-file-native.ts --all
bun scripts/build-response-file-native.ts --check
```

`--target=linux-arm64` (or another prebuild name) builds one target. `--manifest`
updates hashes after all prebuilds have been regenerated. `NOODLE_ZIG` may select
the compiler executable; `NOODLE_NATIVE_BUILD_DIR` may select its temporary build
cache. Windows resolves Node-API functions from the current host executable,
including renamed standalone binaries, without requiring a Node installation.
The four vendored Node-API headers are from Node 25.2.1; their license accompanies
them. The source and eight artifact hashes are recorded in `prebuilds/manifest.json`.

CI tests shipped prebuilds in source and standalone modes, and independently
rebuilds and tests the native source, on the five release targets: macOS
x64/arm64, Linux glibc x64/arm64, and Windows x64. Windows runs its full suite
in a separate job. After the platform checks pass, CI retains each signed (on
macOS), tested executable with commit, version, target, Bun version, and SHA-256
metadata for seven days. Release reuses these binaries from a successful push
CI on the exact main commit; missing or expired artifacts trigger one CI run. All eight prebuilds remain available and
their hashes are verified by `--check`.

## Homebrew source builds

`bun scripts/build-response-file-native.ts --host-compiler` builds only the
macOS or Linux host addon with `CC` (default: `cc`), using the bundled N-API
headers. It does not change the release prebuild manifest and cannot be combined
with cross-build or manifest flags. `build:homebrew` uses this mode, rebuilds
OpenTUI from its matching tagged source, and verifies that the executable embeds
only those two source-built native assets. Run it in an extracted source tree;
it replaces that tree's host addon and installed OpenTUI native library.
