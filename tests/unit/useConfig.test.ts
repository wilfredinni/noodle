import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as yaml from "js-yaml"

import {
  appendCollectionPath,
  loadConfig,
  saveConfig,
  upsertCollectionPath,
  type NoodleConfig,
  CONFIG_FILE_NAME,
} from "../../src/hooks/useConfig"
import { DEFAULT_THEME_NAME } from "../../src/ui/theme-data"

const DEFAULTS: NoodleConfig = {
  theme: DEFAULT_THEME_NAME,
  layout: "stacked",
  confirm_undo_all: true,
  collections: [],
}

describe("loadConfig", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-config-"))
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("returns defaults when file does not exist", () => {
    const result = loadConfig(dir)
    expect(result).toEqual(DEFAULTS)
  })

  it("reads valid YAML file", () => {
    writeFileSync(
      join(dir, CONFIG_FILE_NAME),
      yaml.dump({
        theme: "dracula",
        layout: "side-by-side",
        collections: ["/tmp/a", "/tmp/b"],
      }),
      "utf8",
    )
    const result = loadConfig(dir)
    expect(result).toEqual({
      theme: "dracula",
      layout: "side-by-side",
      confirm_undo_all: true,
      collections: ["/tmp/a", "/tmp/b"],
    })
  })

  it("returns defaults for invalid YAML", () => {
    writeFileSync(join(dir, CONFIG_FILE_NAME), "{ broken: yaml: : ", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual(DEFAULTS)
  })

  it("returns defaults on empty file", () => {
    writeFileSync(join(dir, CONFIG_FILE_NAME), "", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual(DEFAULTS)
  })

  it("handles partial file — missing fields get defaults", () => {
    writeFileSync(join(dir, CONFIG_FILE_NAME), "theme: dracula\n", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual({
      theme: "dracula",
      layout: "stacked",
      confirm_undo_all: true,
      collections: [],
    })
  })

  it("confirm_undo_all defaults to true when missing from file", () => {
    writeFileSync(
      join(dir, CONFIG_FILE_NAME),
      yaml.dump({ theme: "dracula", layout: "stacked" }),
      "utf8",
    )
    const result = loadConfig(dir)
    expect(result.confirm_undo_all).toBe(true)
  })

  it("confirm_undo_all: false round-trips through save/load", () => {
    saveConfig(dir, {
      theme: "dracula",
      layout: "stacked",
      confirm_undo_all: false,
      collections: [],
    })
    const result = loadConfig(dir)
    expect(result.confirm_undo_all).toBe(false)
  })

  it("loads supported external editors and ignores unknown values", () => {
    writeFileSync(join(dir, CONFIG_FILE_NAME), "external_editor: zed\n", "utf8")
    expect(loadConfig(dir).external_editor).toBe("zed")

    writeFileSync(
      join(dir, CONFIG_FILE_NAME),
      "external_editor: arbitrary-command\n",
      "utf8",
    )
    expect(loadConfig(dir).external_editor).toBeUndefined()
  })

  it("normalizes and deduplicates collections", () => {
    writeFileSync(
      join(dir, CONFIG_FILE_NAME),
      yaml.dump({
        theme: "dracula",
        layout: "stacked",
        collections: ["./collections", "./collections"],
      }),
      "utf8",
    )
    const result = loadConfig(dir)
    expect(result.collections).toHaveLength(1)
  })

  it("rejects legacy app proxy credentials", () => {
    writeFileSync(
      join(dir, CONFIG_FILE_NAME),
      "proxy:\n  mode: custom\n  url: http://$PROXY@proxy.test:8080\n  bypass:\n    - localhost\n",
      "utf8",
    )
    expect(() => loadConfig(dir)).toThrow(
      "Proxy URL cannot contain credentials; configure authentication in Settings",
    )
  })
})

describe("appendCollectionPath", () => {
  it("adds a collection without reordering existing paths", () => {
    expect(appendCollectionPath(["/tmp/a", "/tmp/b"], "/tmp/c")).toEqual([
      "/tmp/a",
      "/tmp/b",
      "/tmp/c",
    ])
    expect(appendCollectionPath(["/tmp/a", "/tmp/b"], "/tmp/a")).toEqual([
      "/tmp/a",
      "/tmp/b",
    ])
  })
})

describe("upsertCollectionPath", () => {
  it("moves the opened collection to the front without duplicating it", () => {
    expect(upsertCollectionPath(["/tmp/a", "/tmp/b"], "/tmp/b")).toEqual([
      "/tmp/b",
      "/tmp/a",
    ])
  })
})

describe("saveConfig", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-config-"))
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("writes YAML file", () => {
    saveConfig(dir, {
      theme: "dracula",
      layout: "side-by-side",
      confirm_undo_all: true,
      collections: [],
    })
    const raw = readFileSync(join(dir, CONFIG_FILE_NAME), "utf8")
    expect(yaml.load(raw)).toEqual({
      theme: "dracula",
      layout: "side-by-side",
      confirm_undo_all: true,
      collections: [],
    })
  })

  it("round-trips save→load", () => {
    const input: NoodleConfig = {
      theme: "dracula",
      layout: "side-by-side",
      confirm_undo_all: true,
      collections: [],
    }
    saveConfig(dir, input)
    const result = loadConfig(dir)
    expect(result).toEqual(input)
  })

  it("round-trips app proxy settings", () => {
    const input: NoodleConfig = {
      ...DEFAULTS,
      proxy: { mode: "off" },
    }
    saveConfig(dir, input)
    expect(loadConfig(dir)).toEqual(input)
  })

  it("round-trips the external editor", () => {
    const input: NoodleConfig = {
      ...DEFAULTS,
      external_editor: "vscode",
    }
    saveConfig(dir, input)
    expect(loadConfig(dir)).toEqual(input)
  })

  it("writes and reads back null lastEnv", () => {
    saveConfig(dir, {
      theme: "monokai",
      layout: "stacked",
      confirm_undo_all: true,
      collections: [],
    })
    const result = loadConfig(dir)
    expect(result).toEqual({
      theme: "monokai",
      layout: "stacked",
      confirm_undo_all: true,
      collections: [],
    })
  })

  it("creates directory if missing", () => {
    const deepDir = join(dir, "sub", "dir")
    saveConfig(deepDir, DEFAULTS)
    const raw = readFileSync(join(deepDir, CONFIG_FILE_NAME), "utf8")
    expect(yaml.load(raw)).toEqual(DEFAULTS)
  })
})
