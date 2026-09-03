import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"
import type { Environment } from "../src/schema"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-envsave-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("saveEnvironment", () => {
  it("writes a valid .env file", async () => {
    await env.saveEnvironment(dir, {
      name: "test",
      vars: { base_url: "http://localhost", port: "3000" },
    })
    const content = await readFile(join(dir, "test.env"), "utf8")
    expect(content).toContain("base_url=http://localhost")
    expect(content).toContain("port=3000")
  })

  it("writes _color when set", async () => {
    await env.saveEnvironment(dir, {
      name: "staging",
      vars: { api_key: "abc" },
      color: "warning",
    })
    const content = await readFile(join(dir, "staging.env"), "utf8")
    expect(content).toContain("_color=warning")
    expect(content).toContain("api_key=abc")
  })

  it("writes disabled vars as comments", async () => {
    await env.saveEnvironment(dir, {
      name: "dev",
      vars: { active_key: "val1" },
      disabledVars: { old_key: "val2", DEBUG: "true" },
    })
    const content = await readFile(join(dir, "dev.env"), "utf8")
    expect(content).toContain("active_key=val1")
    expect(content).toContain("# old_key=val2")
    expect(content).toContain("# DEBUG=true")
  })

  it("rejects invalid name", async () => {
    await expect(
      env.saveEnvironment(dir, { name: "../bad", vars: {} }),
    ).rejects.toThrow("env.save: invalid environment name")
  })

  it("rejects invalid color", async () => {
    await expect(
      env.saveEnvironment(dir, {
        name: "test",
        vars: {},
        color: "nonexistent",
      }),
    ).rejects.toThrow('env.save: unknown color "nonexistent"')
  })

  it("rejects CR, LF, and NUL in plaintext values", async () => {
    for (const value of ["line\rbreak", "line\nbreak", "nul\0byte"]) {
      await expect(
        env.saveEnvironment(dir, { name: "test", vars: { value } }),
      ).rejects.toThrow("env.save: values must not contain CR, LF, or NUL")
      await expect(
        env.saveEnvironment(dir, {
          name: "test",
          vars: {},
          disabledVars: { value },
        }),
      ).rejects.toThrow("env.save: values must not contain CR, LF, or NUL")
    }
  })

  it("rejects the reserved _color secret key", async () => {
    await expect(
      env.saveEnvironment(dir, {
        name: "test",
        vars: {},
        secretVars: { _color: "missing" },
      }),
    ).rejects.toThrow('env.save: invalid secret key "_color"')
  })

  it("validates active, disabled, and secret keys with the same grammar", async () => {
    for (const environment of [
      { name: "test", vars: { "bad-key": "value" } },
      { name: "test", vars: {}, disabledVars: { "bad-key": "value" } },
      { name: "test", vars: {}, secretVars: { "bad-key": "missing" } },
      { name: "test", vars: { _color: "value" } },
      { name: "test", vars: {}, disabledVars: { _color: "value" } },
    ] as Environment[]) {
      await expect(env.saveEnvironment(dir, environment)).rejects.toThrow(
        /env\.save: invalid/,
      )
    }
  })

  it("creates exclusively without changing an existing target", async () => {
    await env.saveEnvironment(dir, { name: "test", vars: { value: "old" } })
    await expect(
      env.saveEnvironment(
        dir,
        { name: "test", vars: { value: "new" } },
        { mode: "create" },
      ),
    ).rejects.toMatchObject({ code: "EEXIST" })
    expect(await readFile(join(dir, "test.env"), "utf8")).toContain("value=old")
  })
})
