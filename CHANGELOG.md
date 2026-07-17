# Changelog

All notable changes to Noodle are documented in this file.

## [Unreleased]

## [0.4.7] - 2026-07-17

### Features

- Automatically run `brew upgrade noodle` when updating a Homebrew installation.
- Cache update checks for one hour and support GitHub tokens for release discovery.
- Verify downloaded update binaries with SHA256 checksums and compare versions semantically.

### Fixes

- Stage downloaded binaries in the target directory before replacing the installed executable.
- Harden installer cleanup and Homebrew detection for user-local Linuxbrew installations.
- Publish release checksum assets with the platform binaries.

### Refactors

- Add reusable CI and release workflows, release preparation tooling, and release validation.
- Add pre-commit and pre-push quality checks.
- Expand installation and update coverage, including filesystem isolation for editor tests.

[Unreleased]: https://github.com/wilfredinni/noodle/compare/v0.4.7...HEAD
[0.4.7]: https://github.com/wilfredinni/noodle/compare/v0.4.6...v0.4.7
