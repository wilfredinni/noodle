import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-env-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("loadEnvironment — happy path", () => {
  it("loads a valid environment file", async () => {
    await writeFile(
      join(dir, "development.yml"),
      "name: development\nvars:\n  host: localhost:3000\n  token: abc123\n",
      "utf8",
    )
    const environment = await env.loadEnvironment(dir, "development")
    expect(environment.name).toBe("development")
    expect(environment.vars).toEqual({
      host: "localhost:3000",
      token: "abc123",
    })
  })
})

describe("loadEnvironment — file errors", () => {
  it("throws prefixed error when file is missing", async () => {
    await expect(env.loadEnvironment(dir, "nope")).rejects.toThrow(
      `env.load: environment file not found: ${join(dir, "nope.yml")}`,
    )
  })
})

describe("loadEnvironment — validation", () => {
  it("throws on malformed YAML", async () => {
    await writeFile(join(dir, "bad.yml"), "name: : :\n", "utf8")
    await expect(env.loadEnvironment(dir, "bad")).rejects.toThrow("env.load:")
  })

  it("throws when top-level is a scalar", async () => {
    await writeFile(join(dir, "scalar.yml"), "just-a-string\n", "utf8")
    await expect(env.loadEnvironment(dir, "scalar")).rejects.toThrow(
      "env.load: expected a YAML mapping at top level",
    )
  })

  it("throws when top-level is an array", async () => {
    await writeFile(join(dir, "arr.yml"), "- one\n- two\n", "utf8")
    await expect(env.loadEnvironment(dir, "arr")).rejects.toThrow(
      "env.load: expected a YAML mapping at top level",
    )
  })

  it("throws when name is missing", async () => {
    await writeFile(join(dir, "n.yml"), "vars:\n  x: y\n", "utf8")
    await expect(env.loadEnvironment(dir, "n")).rejects.toThrow(
      'env.load: "name" must be a non-empty string',
    )
  })

  it("throws when name is empty string", async () => {
    await writeFile(join(dir, "e.yml"), 'name: ""\nvars:\n  x: y\n', "utf8")
    await expect(env.loadEnvironment(dir, "e")).rejects.toThrow(
      'env.load: "name" must be a non-empty string',
    )
  })

  it("throws when name is not a string", async () => {
    await writeFile(join(dir, "nn.yml"), "name: 42\nvars:\n  x: y\n", "utf8")
    await expect(env.loadEnvironment(dir, "nn")).rejects.toThrow(
      'env.load: "name" must be a non-empty string',
    )
  })

  it("throws when vars is missing", async () => {
    await writeFile(join(dir, "nv.yml"), "name: dev\n", "utf8")
    await expect(env.loadEnvironment(dir, "nv")).rejects.toThrow(
      'env.load: missing "vars"',
    )
  })

  it("throws when vars is an array", async () => {
    await writeFile(join(dir, "va.yml"), "name: dev\nvars: [1, 2]\n", "utf8")
    await expect(env.loadEnvironment(dir, "va")).rejects.toThrow(
      'env.load: "vars" must be a mapping',
    )
  })

  it("throws when vars is a scalar", async () => {
    await writeFile(join(dir, "vs.yml"), "name: dev\nvars: hello\n", "utf8")
    await expect(env.loadEnvironment(dir, "vs")).rejects.toThrow(
      'env.load: "vars" must be a mapping',
    )
  })

  it("coerces numeric var values to string", async () => {
    await writeFile(
      join(dir, "num.yml"),
      "name: dev\nvars:\n  port: 3000\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "num")
    expect(result.vars.port).toBe("3000")
  })

  it("coerces boolean var values to string", async () => {
    await writeFile(
      join(dir, "bool.yml"),
      "name: dev\nvars:\n  debug: true\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "bool")
    expect(result.vars.debug).toBe("true")
  })

  it("coerces null var values to string", async () => {
    await writeFile(
      join(dir, "null.yml"),
      "name: dev\nvars:\n  flag: null\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "null")
    expect(result.vars.flag).toBe("null")
  })

  it("throws on unknown top-level key", async () => {
    await writeFile(
      join(dir, "unk.yml"),
      "name: dev\nvars:\n  x: y\nextra: z\n",
      "utf8",
    )
    await expect(env.loadEnvironment(dir, "unk")).rejects.toThrow(
      'env.load: unknown key "extra"',
    )
  })

  it("throws on empty var name", async () => {
    await writeFile(
      join(dir, "empty.yml"),
      'name: dev\nvars:\n  "": value\n',
      "utf8",
    )
    await expect(env.loadEnvironment(dir, "empty")).rejects.toThrow(
      "env.load: var name must not be empty",
    )
  })

  it("decouples name field from filename", async () => {
    await writeFile(
      join(dir, "dev.yml"),
      "name: development\nvars:\n  x: y\n",
      "utf8",
    )
    const result = await env.loadEnvironment(dir, "dev")
    expect(result.name).toBe("development")
  })
})
