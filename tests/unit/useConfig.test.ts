import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as yaml from "js-yaml"

import {
  loadConfig,
  saveConfig,
  type NoodleConfig,
  CONFIG_FILE_NAME,
} from "../../src/hooks/useConfig"

const DEFAULTS: NoodleConfig = { theme: 0, layout: "stacked" }

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
      yaml.dump({ theme: 1, layout: "side-by-side" }),
      "utf8",
    )
    const result = loadConfig(dir)
    expect(result).toEqual({ theme: 1, layout: "side-by-side" })
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
    writeFileSync(join(dir, CONFIG_FILE_NAME), "theme: 1\n", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual({ theme: 1, layout: "stacked" })
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
    saveConfig(dir, { theme: 1, layout: "side-by-side" })
    const raw = readFileSync(join(dir, CONFIG_FILE_NAME), "utf8")
    expect(yaml.load(raw)).toEqual({ theme: 1, layout: "side-by-side" })
  })

  it("round-trips save→load", () => {
    const input: NoodleConfig = { theme: 1, layout: "side-by-side" }
    saveConfig(dir, input)
    const result = loadConfig(dir)
    expect(result).toEqual(input)
  })

  it("writes and reads back null lastEnv", () => {
    saveConfig(dir, { theme: 2, layout: "stacked" })
    const result = loadConfig(dir)
    expect(result).toEqual({ theme: 2, layout: "stacked" })
  })

  it("creates directory if missing", () => {
    const deepDir = join(dir, "sub", "dir")
    saveConfig(deepDir, DEFAULTS)
    const raw = readFileSync(join(deepDir, CONFIG_FILE_NAME), "utf8")
    expect(yaml.load(raw)).toEqual({ theme: 0, layout: "stacked" })
  })
})
