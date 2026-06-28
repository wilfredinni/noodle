import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-envdel-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("deleteEnvironment", () => {
  it("deletes an existing .env file", async () => {
    await writeFile(join(dir, "test.env"), "x=y\n", "utf8")
    await env.deleteEnvironment(dir, "test")
    const names = await env.listEnvironments(dir)
    expect(names).toEqual([])
  })

  it("throws when file not found", async () => {
    await expect(env.deleteEnvironment(dir, "missing")).rejects.toThrow(
      "env.delete: environment not found: missing",
    )
  })

  it("rejects invalid name", async () => {
    await expect(env.deleteEnvironment(dir, "../bad")).rejects.toThrow(
      "env.delete: invalid environment name",
    )
  })
})
