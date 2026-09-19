# Response file native operations

This private Node-API 8 addon pins response output directories and creates each
new component relative to an open directory without following symbolic links.
It is used by both CLI downloads and TUI Save As. Existing directory aliases are
resolved during preparation; new directories and files are created only when a
completed response is saved. The native I/O uses asynchronous work so it does not
block the terminal UI.

Prebuilds are checked into this repository for six targets: macOS and Windows
x64/arm64, and Linux x64/arm64 with glibc. Linux musl is unsupported. Literal requires
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
them. The source and six artifact hashes are recorded in `prebuilds/manifest.json`.

CI tests shipped prebuilds in source and standalone modes and independently
rebuilds and tests the native source across all six official targets.
