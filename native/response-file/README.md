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
cache. Windows import libraries are from Node 22.14.0 and are downloaded only
for maintainer builds, after verification against the official SHA-256 hashes.
The four vendored Node-API headers are from Node 25.2.1; their license accompanies
them. The source and eight artifact hashes are recorded in `prebuilds/manifest.json`.

CI tests shipped prebuilds in source and standalone modes across all eight
targets, and independently rebuilds and tests the native source on the six
macOS/Windows/glibc targets. Musl tests run in the official Alpine Bun image.
