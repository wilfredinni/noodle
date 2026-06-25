import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { filestore } from "../src/filestore"


let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-fs-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("filestore.loadCollection — directory state", () => {
  it("throws on missing directory", async () => {
    const missing = join(dir, "does-not-exist")
    await expect(filestore.loadCollection(missing)).rejects.toThrow(
      `filestore.loadCollection: directory not found "${missing}"`,
    )
  })

  it("returns empty Collection when dir has no .yml files", async () => {
    const col = await filestore.loadCollection(dir)
    expect(col.requests).toEqual([])
    expect(col.id).toBe(col.name)
    expect(col.id).toBeTruthy()
  })

  it("derives id and name from directory basename", async () => {
    const named = join(dir, "my-api")
    await mkdir(named)
    const col = await filestore.loadCollection(named)
    expect(col.id).toBe("my-api")
    expect(col.name).toBe("my-api")
  })
})
