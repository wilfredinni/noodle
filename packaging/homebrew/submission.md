-----

<!-- Review this draft personally after publishing v0.9.8 and validating the final formula. Leave checks unmarked until completed. PR title: noodle 0.9.8 (new formula). -->

- [ ] Have you followed the [guidelines for contributing](https://github.com/Homebrew/homebrew-core/blob/HEAD/CONTRIBUTING.md)?
- [ ] Have you ensured that your commits follow the [commit style guide](https://docs.brew.sh/Formula-Cookbook#commit)?
- [ ] Have you checked that there aren't other open [pull requests](https://github.com/Homebrew/homebrew-core/pulls) for the same formula update/change?
- [ ] Have you built your formula locally with `HOMEBREW_NO_INSTALL_FROM_API=1 brew install --build-from-source noodle`?
- [ ] Is your test running fine `brew test noodle`?
- [ ] Does your build pass `brew audit --strict noodle` (after doing `HOMEBREW_NO_INSTALL_FROM_API=1 brew install --build-from-source noodle`)? If this is a new formula, does it pass `brew audit --new noodle`?

-----

- [ ] I did not use AI/LLM to create this PR, or I disclosed the tool/model below and reviewed its output; I did not attribute commits to AI and will answer maintainer questions and review comments myself without AI/LLM.

<!-- Non-maintainers may only have one AI-assisted PR open at a time. -->

-----

Add Noodle, an Apache-2.0 terminal REST client with YAML collections and
non-interactive CLI automation. The formula builds the executable and both native
libraries from versioned source. Homebrew installations display upgrade guidance
without self-updating. The test creates and inspects a collection and checks
embedded QuickJS and crypto before HTTP.

AI assistance: OpenAI Codex helped prepare the upstream changes and formula.
Before submitting, fill in the exact model used, personally review the generated
code and this description, and replace this instruction with that disclosure.

Local preparation passed an extracted-source build on macOS ARM64, native
response/worker checks, compiled scripting smoke, and formula style. The formula
test is validated separately against an isolated source-built prefix. This does
not replace the final published-source Homebrew installation, test, audit, and
CI checks; record their actual results here before submission.
