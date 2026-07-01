import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { loadCollection } from "../../src/filestore/load"
import { saveRequest } from "../../src/filestore/save"
import { slugify } from "../../src/ui/NewRequestOverlay"
import type { Request } from "../../src/schema"

describe("NewRequestOverlay integration", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "noodle-test-new-req-"))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves a new request to disk with correct defaults", async () => {
    const id = slugify("Get Users")
    expect(id).toBe("get-users")

    const req: Request = {
      id,
      name: "Get Users",
      method: "POST",
      url: "$base_url/users",
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      headers: {},
      params: {},
      auth: { type: "none" },
      bodyType: "none",
      body: "",
    }

    await saveRequest(tmpDir, req)

    const collection = await loadCollection(tmpDir)
    expect(collection.requests.length).toBe(1)

    const loaded = collection.requests[0]!
    expect(loaded.id).toBe("get-users")
    expect(loaded.name).toBe("Get Users")
    expect(loaded.method).toBe("POST")
    expect(loaded.url).toBe("$base_url/users")
    expect(loaded.auth?.type).toBe("none")
    expect(loaded.bodyType).toBe("none")
  })

  it("overwrites existing request on save", async () => {
    const id = slugify("Get Users")
    const req: Request = {
      id,
      name: "Get Users Updated",
      method: "GET",
      url: "$base_url/users",
      timeout: 0,
      headers: {},
      params: {},
    }

    await saveRequest(tmpDir, req)

    const collection = await loadCollection(tmpDir)
    const reloaded = collection.requests.find((r) => r.id === id)
    expect(reloaded?.method).toBe("GET")
    expect(reloaded?.name).toBe("Get Users Updated")
  })
})
