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
    expect(environment.vars).toEqual({ host: "localhost:3000", token: "abc123" })
  })
})
