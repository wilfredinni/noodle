import { expect, it } from "bun:test"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

it("rejects wrapped release prose while preserving intentional Markdown structure", () => {
  const directory = mkdtempSync(join(tmpdir(), "noodle-release-notes-"))
  const script = join(directory, "scripts/release-notes.ts")
  try {
    mkdirSync(join(directory, "scripts"))
    copyFileSync(
      resolve(import.meta.dir, "../../scripts/release-notes.ts"),
      script,
    )
    const run = (body: string) => {
      writeFileSync(
        join(directory, "CHANGELOG.md"),
        `# Changelog\n\n## [Unreleased]\n\n## [1.2.3] - 2026-09-22\n\n${body}\n\n## [1.2.2]\n\nHistorical\nwrapping.\n\n[1.2.3]: https://example.com/release\n`,
      )
      return Bun.spawnSync([process.execPath, script, "--tag", "v1.2.3"])
    }
    const body = [
      "A complete summary with enough words to exceed eighty columns stays on one physical line without any artificial wrapping.",
      "",
      "### ✨ Features",
      "",
      "- A complete list item with enough words to exceed eighty columns stays on one physical line without any artificial wrapping.",
      "- Another item.",
      "  - A nested item.",
      "",
      "[Release article.](https://example.com/article)",
      "",
      "```yaml",
      "scripts:",
      "  pre: |",
      "    console.log('hello')",
      "```",
      "",
      "~~~text",
      "first code line",
      "second code line",
      "~~~",
      "",
      "| Column | Value |",
      "| --- | --- |",
      "| A | B |",
    ].join("\n")
    const valid = run(body)
    expect(valid.exitCode).toBe(0)
    expect(valid.stdout.toString()).toBe(`## [1.2.3] - 2026-09-22\n\n${body}\n`)
    for (const wrapped of [
      "A summary that\ncontinues here.",
      "- An item that\n  continues here.",
      "- An item that\ncontinues without indentation.",
      "```text\nfirst\nsecond\n```\n\nA summary that\ncontinues here.",
    ]) {
      const invalid = run(wrapped)
      expect(invalid.exitCode).toBe(1)
      expect(invalid.stdout.toString()).toBe("")
      expect(invalid.stderr.toString()).toContain("one physical line")
      expect(invalid.stderr.toString()).toMatch(/CHANGELOG\.md:\d+:/)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
