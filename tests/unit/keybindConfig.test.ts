import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as yaml from "js-yaml"
import { bindingDefaults } from "../../src/ui/keybind"
import { KEYBINDS_FILE_NAME, saveKeybinds } from "../../src/ui/keybindConfig"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe("saveKeybinds", () => {
  it("writes the minimal override file", () => {
    const dir = mkdtempSync(join(tmpdir(), "noodle-keybinds-"))
    dirs.push(dir)
    saveKeybinds(dir, {
      ...bindingDefaults(),
      request_save: "ctrl+x",
    })

    expect(
      yaml.load(readFileSync(join(dir, KEYBINDS_FILE_NAME), "utf8")),
    ).toEqual({ request_save: "ctrl+x" })
  })

  it("throws without changing live state when persistence fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "noodle-keybinds-file-"))
    dirs.push(dir)
    const file = join(dir, "not-a-directory")
    writeFileSync(file, "occupied")
    expect(() => saveKeybinds(file, bindingDefaults())).toThrow(
      "keybindConfig.saveKeybinds",
    )
  })
})
