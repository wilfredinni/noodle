import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

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
      env.saveEnvironment(dir, { name: "test", vars: {}, color: "nonexistent" }),
    ).rejects.toThrow('env.save: unknown color "nonexistent"')
  })
})
