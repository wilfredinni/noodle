import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync, existsSync, unlinkSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("edit request rename (save-before-delete)", () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "noodle-edit-"))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("saves new file before deleting old file on rename", () => {
    const oldPath = join(tmpDir, "old-name.yml")
    const newPath = join(tmpDir, "new-name.yml")

    writeFileSync(oldPath, "name: Old Name\nmethod: GET\nurl: /test\n", "utf8")
    expect(existsSync(oldPath)).toBe(true)

    writeFileSync(newPath, "name: New Name\nmethod: GET\nurl: /test\n", "utf8")
    expect(existsSync(newPath)).toBe(true)

    unlinkSync(oldPath)
    expect(existsSync(oldPath)).toBe(false)

    const written = readFileSync(newPath, "utf8")
    expect(written).toContain("New Name")

    unlinkSync(newPath)
  })
})
