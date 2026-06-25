import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises"
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

describe("filestore.saveRequest — writes", () => {
  it("writes <dir>/<id>.yml with serialized YAML content", async () => {
    await mkdir(join(dir, "sub"), { recursive: true })
    const req = makeReq({ id: "ping", name: "Ping", url: "https://x" })
    await filestore.saveRequest(join(dir, "sub"), req)
    const content = await readFile(join(dir, "sub", "ping.yml"), "utf8")
    expect(content).toContain("name: Ping")
    expect(content).toContain("method: GET")
    expect(content).toContain("url: https://x")
  })

  it("creates dir (and parents) if missing", async () => {
    const target = join(dir, "a", "b", "c")
    const req = makeReq({ id: "x" })
    await filestore.saveRequest(target, req)
    const content = await readFile(join(target, "x.yml"), "utf8")
    expect(content).toContain("name: X")
  })

  it("overwrites an existing file with new content", async () => {
    const req1 = makeReq({ id: "x", name: "Old" })
    await filestore.saveRequest(dir, req1)
    const req2 = makeReq({ id: "x", name: "New" })
    await filestore.saveRequest(dir, req2)
    const content = await readFile(join(dir, "x.yml"), "utf8")
    expect(content).toContain("name: New")
    expect(content).not.toContain("name: Old")
  })

  it("written file round-trips through lang.parseRequest", async () => {
    const req = makeReq({
      id: "post-thing",
      name: "Post thing",
      method: "POST",
      url: "https://api.example.com/items",
      headers: { "Content-Type": "application/json" },
      body: '{"a": 1}',
      auth: { type: "bearer", token: "t" },
    })
    await filestore.saveRequest(dir, req)
    const { lang } = await import("../src/lang")
    const content = await readFile(join(dir, "post-thing.yml"), "utf8")
    const reparsed = lang.parseRequest("post-thing", content)
    expect(reparsed).toEqual(req)
  })
})

describe("filestore.saveRequest — id validation", () => {
  it("rejects empty id", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "" })),
    ).rejects.toThrow("filestore.saveRequest: missing or invalid id")
  })

  it("rejects undefined id (treated as empty)", async () => {
    const req = makeReq()
    delete (req as { id?: string }).id
    await expect(filestore.saveRequest(dir, req)).rejects.toThrow(
      "filestore.saveRequest: missing or invalid id",
    )
  })

  it("rejects id with forward slash", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "../evil" })),
    ).rejects.toThrow(
      'filestore.saveRequest: id must not contain path separators or ".."',
    )
  })

  it("rejects id with backslash", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "a\\b" })),
    ).rejects.toThrow(
      'filestore.saveRequest: id must not contain path separators or ".."',
    )
  })

  it("rejects id containing .. substring", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "a..b" })),
    ).rejects.toThrow(
      'filestore.saveRequest: id must not contain path separators or ".."',
    )
  })

  it("accepts ids with spaces, dots, capitals", async () => {
    await filestore.saveRequest(dir, makeReq({ id: "My.Request v2" }))
    const content = await readFile(join(dir, "My.Request v2.yml"), "utf8")
    expect(content).toContain("name: X")
  })
})
