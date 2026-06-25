import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { filestore } from "../src/filestore"
import type { Request } from "../src/schema"


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

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "x",
    name: "X",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: {},
    auth: { type: "none" },
    ...over,
  }
}

const yamlTmpl = (r: Request) =>
  `name: ${r.name}\nmethod: ${r.method}\nurl: ${r.url}\n`

describe("filestore.loadCollection — file selection and order", () => {
  it("reads a single .yml file as one request", async () => {
    await writeFile(join(dir, "get-user.yml"), yamlTmpl(makeReq()))
    const col = await filestore.loadCollection(dir)
    expect(col.requests).toHaveLength(1)
    expect(col.requests[0].id).toBe("get-user")
  })

  it("sorts requests by filename ascending", async () => {
    await writeFile(join(dir, "z.yml"), yamlTmpl(makeReq({ name: "Z" })))
    await writeFile(join(dir, "a.yml"), yamlTmpl(makeReq({ name: "A" })))
    await writeFile(join(dir, "m.yml"), yamlTmpl(makeReq({ name: "M" })))
    const col = await filestore.loadCollection(dir)
    expect(col.requests.map((r) => r.id)).toEqual(["a", "m", "z"])
  })

  it("ignores non-.yml files (.yaml, .json, .txt, dotfile)", async () => {
    await writeFile(join(dir, "keep.yml"), yamlTmpl(makeReq()))
    await writeFile(join(dir, "skip.yaml"), yamlTmpl(makeReq()))
    await writeFile(join(dir, "meta.json"), "{}")
    await writeFile(join(dir, "readme.txt"), "hi")
    await writeFile(join(dir, ".hidden.yml"), yamlTmpl(makeReq()))
    const col = await filestore.loadCollection(dir)
    expect(col.requests.map((r) => r.id)).toEqual(["keep"])
  })

  it("ignores subdirectories even if named like .yml", async () => {
    await writeFile(join(dir, "real.yml"), yamlTmpl(makeReq()))
    await mkdir(join(dir, "sub.yml"))
    const col = await filestore.loadCollection(dir)
    expect(col.requests.map((r) => r.id)).toEqual(["real"])
  })

  it("wraps lang parse failures with filename and lang message", async () => {
    await writeFile(join(dir, "broken.yml"), "name: Foo\n  : : :\n")
    await expect(filestore.loadCollection(dir)).rejects.toThrow(
      /filestore\.loadCollection: failed to parse "broken\.yml": lang\.parseRequest: YAML syntax:/,
    )
  })

  it("collapses trailing slash in dir basename", async () => {
    await writeFile(join(dir, "x.yml"), yamlTmpl(makeReq()))
    const col = await filestore.loadCollection(dir + "/")
    expect(col.id).toBe(basename(dir))
    expect(col.name).toBe(basename(dir))
  })
})
