import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-crud-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("environment CRUD", () => {
  it("full lifecycle: create → list → read → update → rename → delete", async () => {
    // 1. Create
    await env.saveEnvironment(dir, {
      name: "dev",
      vars: { port: "3000", host: "localhost" },
      color: "success",
    })
    let names = await env.listEnvironments(dir)
    expect(names).toEqual(["dev"])

    // 2. Read
    let loaded = await env.loadEnvironment(dir, "dev")
    expect(loaded.vars).toEqual({ port: "3000", host: "localhost" })
    expect(loaded.color).toBe("success")

    // 3. Clone (implied rename)
    await env.cloneEnvironment(dir, "dev", "dev-staging")
    names = await env.listEnvironments(dir)
    expect(names).toEqual(["dev", "dev-staging"])

    // 4. Update — add var, change color
    await env.saveEnvironment(dir, {
      name: "dev",
      vars: { port: "3000", host: "localhost", debug: "true" },
      color: "warning",
    })
    loaded = await env.loadEnvironment(dir, "dev")
    expect(loaded.vars).toEqual({
      port: "3000",
      host: "localhost",
      debug: "true",
    })
    expect(loaded.color).toBe("warning")

    // 5. Delete cloned
    await env.deleteEnvironment(dir, "dev-staging")
    names = await env.listEnvironments(dir)
    expect(names).toEqual(["dev"])

    // 6. Delete original
    await env.deleteEnvironment(dir, "dev")
    names = await env.listEnvironments(dir)
    expect(names).toEqual([])
  })

  it("preserves disabled vars on round-trip", async () => {
    await env.saveEnvironment(dir, {
      name: "prod",
      vars: { api_key: "live" },
      disabledVars: { old_key: "deprecated" },
    })
    const loaded = await env.loadEnvironment(dir, "prod")
    expect(loaded.vars).toEqual({ api_key: "live" })
    expect(loaded.disabledVars).toEqual({ old_key: "deprecated" })

    // Re-save unchanged
    await env.saveEnvironment(dir, loaded)
    const reloaded = await env.loadEnvironment(dir, "prod")
    expect(reloaded.vars).toEqual({ api_key: "live" })
    expect(reloaded.disabledVars).toEqual({ old_key: "deprecated" })
  })
})
