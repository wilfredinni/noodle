import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-envclone-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("cloneEnvironment", () => {
  beforeEach(async () => {
    await env.saveEnvironment(dir, {
      name: "original",
      vars: { key1: "val1", key2: "val2" },
      color: "success",
      disabledVars: { old_key: "old_val" },
    })
  })

  it("clones an existing environment", async () => {
    await env.cloneEnvironment(dir, "original", "copy")
    const loaded = await env.loadEnvironment(dir, "copy")
    expect(loaded.name).toBe("copy")
    expect(loaded.vars).toEqual({ key1: "val1", key2: "val2" })
    expect(loaded.color).toBe("success")
    expect(loaded.disabledVars).toEqual({ old_key: "old_val" })
  })

  it("clones secret declarations without copying values", async () => {
    await env.saveEnvironment(dir, {
      name: "with-secret",
      vars: { TOKEN: "must-not-persist" },
      secretVars: { TOKEN: "keychain" },
    })
    await env.cloneEnvironment(dir, "with-secret", "secret-copy")
    const loaded = await env.loadEnvironment(dir, "secret-copy", {
      resolveSecrets: false,
    })
    expect(loaded.vars).toEqual({})
    expect(loaded.secretVars).toEqual({ TOKEN: "missing" })
  })

  it("rejects invalid target name", async () => {
    await expect(
      env.cloneEnvironment(dir, "original", "../bad"),
    ).rejects.toThrow("env.clone: invalid target name")
  })

  it("throws if source does not exist", async () => {
    await expect(
      env.cloneEnvironment(dir, "nonexistent", "target"),
    ).rejects.toThrow("env.load: environment file not found")
  })

  it("does not overwrite an existing destination", async () => {
    await env.saveEnvironment(dir, {
      name: "copy",
      vars: { existing: "keep" },
    })
    const before = await readFile(join(dir, "copy.env"), "utf8")
    await expect(env.cloneEnvironment(dir, "original", "copy")).rejects.toThrow(
      /already exists/,
    )
    expect(await readFile(join(dir, "copy.env"), "utf8")).toBe(before)
  })
})
