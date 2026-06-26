import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as yaml from "js-yaml"

import { loadConfig, saveConfig, type NoodleConfig, CONFIG_FILE_NAME } from "../../src/ui/useConfig"

const DEFAULTS: NoodleConfig = { theme: 0, layout: "stacked", lastEnv: null }

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

  it("reads valid YAML file", async () => {
    await writeFile(join(dir, CONFIG_FILE_NAME), yaml.dump({ theme: 1, layout: "side-by-side", last_env: "prod" }), "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual({ theme: 1, layout: "side-by-side", lastEnv: "prod" })
  })

  it("returns defaults for invalid YAML", async () => {
    await writeFile(join(dir, CONFIG_FILE_NAME), "{ broken: yaml: : ", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual(DEFAULTS)
  })

  it("returns defaults on empty file", async () => {
    await writeFile(join(dir, CONFIG_FILE_NAME), "", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual(DEFAULTS)
  })

  it("handles partial file — missing fields get defaults", async () => {
    await writeFile(join(dir, CONFIG_FILE_NAME), "theme: 1\n", "utf8")
    const result = loadConfig(dir)
    expect(result).toEqual({ theme: 1, layout: "stacked", lastEnv: null })
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

  it("writes YAML file", async () => {
    saveConfig(dir, { theme: 1, layout: "side-by-side", lastEnv: "prod" })
    const raw = await readFile(join(dir, CONFIG_FILE_NAME), "utf8")
    expect(yaml.load(raw)).toEqual({ theme: 1, layout: "side-by-side", last_env: "prod" })
  })

  it("round-trips save→load", () => {
    const input: NoodleConfig = { theme: 1, layout: "side-by-side", lastEnv: "staging" }
    saveConfig(dir, input)
    const result = loadConfig(dir)
    expect(result).toEqual(input)
  })

  it("writes and reads back null lastEnv", () => {
    saveConfig(dir, { theme: 2, layout: "stacked", lastEnv: null })
    const result = loadConfig(dir)
    expect(result).toEqual({ theme: 2, layout: "stacked", lastEnv: null })
  })

  it("creates directory if missing", async () => {
    const deepDir = join(dir, "sub", "dir")
    saveConfig(deepDir, DEFAULTS)
    const raw = await readFile(join(deepDir, CONFIG_FILE_NAME), "utf8")
    expect(yaml.load(raw)).toEqual({ theme: 0, layout: "stacked", last_env: null })
  })
})
