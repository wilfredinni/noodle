import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  readdir,
  symlink,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import {
  filestore,
  loadSettings,
  saveSettings,
  saveFolder,
  deleteFolder,
} from "../src/filestore"
import type { Folder, Request, Collection } from "../src/schema"

function reqs(col: Collection): Request[] {
  return col.items
    .filter(
      (i): i is { type: "request"; data: Request } => i.type === "request",
    )
    .map((i) => i.data)
}

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
    expect(reqs(col)).toEqual([])
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
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

function makeFolder(over: Partial<Folder> = {}): Folder {
  return {
    id: "f",
    name: "F",
    path: "f",
    children: [],
    ...over,
  }
}

const yamlTmpl = (r: Request) =>
  `name: ${r.name}\nmethod: ${r.method}\nurl: ${r.url}\n`

describe("filestore.loadCollection — file selection and order", () => {
  it("reads a single .yml file as one request", async () => {
    await writeFile(join(dir, "get-user.yml"), yamlTmpl(makeReq()))
    const col = await filestore.loadCollection(dir)
    expect(reqs(col)).toHaveLength(1)
    expect(reqs(col)[0].id).toBe("get-user")
  })

  it("sorts requests by filename ascending", async () => {
    await writeFile(join(dir, "z.yml"), yamlTmpl(makeReq({ name: "Z" })))
    await writeFile(join(dir, "a.yml"), yamlTmpl(makeReq({ name: "A" })))
    await writeFile(join(dir, "m.yml"), yamlTmpl(makeReq({ name: "M" })))
    const col = await filestore.loadCollection(dir)
    expect(reqs(col).map((r) => r.id)).toEqual(["a", "m", "z"])
  })

  it("ignores non-.yml files (.yaml, .json, .txt, dotfile)", async () => {
    await writeFile(join(dir, "keep.yml"), yamlTmpl(makeReq()))
    await writeFile(join(dir, "skip.yaml"), yamlTmpl(makeReq()))
    await writeFile(join(dir, "meta.json"), "{}")
    await writeFile(join(dir, "readme.txt"), "hi")
    await writeFile(join(dir, ".hidden.yml"), yamlTmpl(makeReq()))
    const col = await filestore.loadCollection(dir)
    expect(reqs(col).map((r) => r.id)).toEqual(["keep"])
  })

  it("includes subdirectories as folders", async () => {
    await writeFile(join(dir, "real.yml"), yamlTmpl(makeReq()))
    await mkdir(join(dir, "sub"))
    await writeFile(
      join(dir, "sub", "nested.yml"),
      yamlTmpl(makeReq({ name: "Nested", id: "nested" })),
    )
    const col = await filestore.loadCollection(dir)
    expect(col.items).toHaveLength(2)
    const reqItem = col.items.find((i) => i.type === "request")
    const folderItem = col.items.find((i) => i.type === "folder")
    expect(folderItem).toBeDefined()
    expect(reqItem).toBeDefined()
    if (reqItem?.type === "request") expect(reqItem.data.id).toBe("real")
  })

  it("skips settings.yml (not a request)", async () => {
    await writeFile(join(dir, "get.yml"), yamlTmpl(makeReq({ name: "Get" })))
    await writeFile(join(dir, "settings.yml"), "environment: dev\n")
    const col = await filestore.loadCollection(dir)
    expect(reqs(col).map((r) => r.id)).toEqual(["get"])
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
      headers: { "Content-Type": { value: "application/json", enabled: true } },
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
    ).rejects.toThrow("filestore.validatePathId: missing or invalid id")
  })

  it("rejects undefined id (treated as empty)", async () => {
    const req = makeReq()
    delete (req as { id?: string }).id
    await expect(filestore.saveRequest(dir, req)).rejects.toThrow(
      "filestore.validatePathId: missing or invalid id",
    )
  })

  it("allows id with forward slash (subdirectory path)", async () => {
    await filestore.saveRequest(dir, makeReq({ id: "sub/ping" }))
    const content = await readFile(join(dir, "sub", "ping.yml"), "utf8")
    expect(content).toContain("name: X")
  })

  it("rejects id with backslash", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "a\\b" })),
    ).rejects.toThrow(
      'filestore.validatePathId: id must not contain backslash or ".."',
    )
  })

  it("rejects id containing .. substring", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "a..b" })),
    ).rejects.toThrow(
      'filestore.validatePathId: id must not contain backslash or ".."',
    )
  })

  it("rejects id that is just '.'", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "." })),
    ).rejects.toThrow(
      'filestore.validatePathId: id must not be "." or start with "./"',
    )
  })

  it('rejects id that starts with "./"', async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "./foo" })),
    ).rejects.toThrow(
      'filestore.validatePathId: id must not be "." or start with "./"',
    )
  })

  it("rejects id that is an absolute path", async () => {
    await expect(
      filestore.saveRequest(dir, makeReq({ id: "/etc/passwd" })),
    ).rejects.toThrow(
      "filestore.validatePathId: id must not be an absolute path",
    )
  })

  it("accepts ids with spaces, dots, capitals", async () => {
    await filestore.saveRequest(dir, makeReq({ id: "My.Request v2" }))
    const content = await readFile(join(dir, "My.Request v2.yml"), "utf8")
    expect(content).toContain("name: X")
  })
})

describe("filestore — integration round-trip", () => {
  it("save then load returns the same Collection (identity from folder)", async () => {
    const collectionDir = join(dir, "my-api")
    const a = makeReq({
      id: "get-user",
      name: "Get user",
      method: "GET",
      url: "https://api.example.com/users/1",
      headers: { Accept: { value: "application/json", enabled: true } },
    })
    const b = makeReq({
      id: "create-post",
      name: "Create post",
      method: "POST",
      url: "https://api.example.com/posts",
      body: '{"title": "hi"}',
      auth: { type: "bearer", token: "tok" },
    })
    await filestore.saveRequest(collectionDir, a)
    await filestore.saveRequest(collectionDir, b)

    const col = await filestore.loadCollection(collectionDir)
    expect(col.id).toBe("my-api")
    expect(col.name).toBe("my-api")
    expect(reqs(col).map((r) => r.id)).toEqual(["create-post", "get-user"])
    expect(reqs(col)[0]).toEqual(b)
    expect(reqs(col)[1]).toEqual(a)
  })

  it("load on lazy-created dir yields sorted requests only after save", async () => {
    const fresh = join(dir, "lazy")
    // Verify dir doesn't exist yet → load should throw
    await expect(filestore.loadCollection(fresh)).rejects.toThrow(
      `filestore.loadCollection: directory not found "${fresh}"`,
    )

    // Save creates the directory
    await filestore.saveRequest(fresh, makeReq({ id: "z" }))
    await filestore.saveRequest(fresh, makeReq({ id: "a" }))

    // Now load should work and return sorted requests
    const after = await filestore.loadCollection(fresh)
    expect(after.id).toBe("lazy")
    expect(after.name).toBe("lazy")
    expect(reqs(after).map((r) => r.id)).toEqual(["a", "z"])
  })
})

describe("filestore.saveFolder — path validation", () => {
  it("rejects '.' as path", async () => {
    await expect(saveFolder(dir, makeFolder({ path: "." }))).rejects.toThrow(
      'filestore.validatePathId: id must not be "." or start with "./"',
    )
  })

  it("rejects absolute path", async () => {
    await expect(saveFolder(dir, makeFolder({ path: "/etc" }))).rejects.toThrow(
      "filestore.validatePathId: id must not be an absolute path",
    )
  })

  it("rejects path with backslash", async () => {
    await expect(saveFolder(dir, makeFolder({ path: "a\\b" }))).rejects.toThrow(
      'filestore.validatePathId: id must not contain backslash or ".."',
    )
  })

  it("creates folder.yml on disk", async () => {
    await saveFolder(dir, makeFolder({ path: "my-folder", name: "My Folder" }))
    const content = await readFile(join(dir, "my-folder", "folder.yml"), "utf8")
    expect(content).toContain("name: My Folder")
  })

  it("overwrites folder.yml with new name on rename", async () => {
    const folderPath = "rename-test"
    await saveFolder(dir, makeFolder({ path: folderPath, name: "Old Name" }))
    const before = await readFile(join(dir, folderPath, "folder.yml"), "utf8")
    expect(before).toContain("name: Old Name")

    await saveFolder(dir, makeFolder({ path: folderPath, name: "New Name" }))
    const after = await readFile(join(dir, folderPath, "folder.yml"), "utf8")
    expect(after).toContain("name: New Name")
    expect(after).not.toContain("Old Name")
  })
})

describe("filestore.deleteFolder — path validation", () => {
  it("rejects '.' as path", async () => {
    await expect(deleteFolder(dir, ".")).rejects.toThrow(
      'filestore.validatePathId: id must not be "." or start with "./"',
    )
  })

  it("rejects absolute path", async () => {
    await expect(deleteFolder(dir, "/etc")).rejects.toThrow(
      "filestore.validatePathId: id must not be an absolute path",
    )
  })

  it("rejects path with backslash", async () => {
    await expect(deleteFolder(dir, "a\\b")).rejects.toThrow(
      'filestore.validatePathId: id must not contain backslash or ".."',
    )
  })

  it("deletes folder directory", async () => {
    await mkdir(join(dir, "to-delete"))
    await writeFile(
      join(dir, "to-delete", "folder.yml"),
      "meta:\n  name: Bye\n",
      "utf8",
    )
    await deleteFolder(dir, "to-delete")
    await expect(
      readFile(join(dir, "to-delete", "folder.yml"), "utf8"),
    ).rejects.toThrow()
  })

  it("deletes folder with nested requests and subfolders", async () => {
    await mkdir(join(dir, "nested", "sub"), { recursive: true })
    await writeFile(
      join(dir, "nested", "folder.yml"),
      "meta:\n  name: Nested\n",
      "utf8",
    )
    await writeFile(
      join(dir, "nested", "get-user.yml"),
      "method: GET\nurl: /user\n",
      "utf8",
    )
    await writeFile(
      join(dir, "nested", "sub", "folder.yml"),
      "meta:\n  name: Sub\n",
      "utf8",
    )
    await writeFile(
      join(dir, "nested", "sub", "delete.yml"),
      "method: DELETE\nurl: /user\n",
      "utf8",
    )

    await deleteFolder(dir, "nested")

    await expect(
      readFile(join(dir, "nested", "folder.yml"), "utf8"),
    ).rejects.toThrow()
    await expect(
      readFile(join(dir, "nested", "sub", "delete.yml"), "utf8"),
    ).rejects.toThrow()
    await expect(readdir(join(dir, "nested"))).rejects.toThrow()
  })
})

describe("filestore.loadSettings", () => {
  it("returns empty object when settings.yml does not exist", async () => {
    const result = await loadSettings(dir)
    expect(result).toEqual({})
  })

  it("reads environment from settings.yml", async () => {
    await writeFile(join(dir, "settings.yml"), "environment: staging\n", "utf8")
    const result = await loadSettings(dir)
    expect(result).toEqual({ environment: "staging" })
  })

  it("returns empty for invalid YAML in settings.yml", async () => {
    await writeFile(join(dir, "settings.yml"), "{ broken: : : ", "utf8")
    const result = await loadSettings(dir)
    expect(result).toEqual({})
  })

  it("returns empty for empty settings.yml", async () => {
    await writeFile(join(dir, "settings.yml"), "", "utf8")
    const result = await loadSettings(dir)
    expect(result).toEqual({})
  })

  it("returns empty when environment key is not a string", async () => {
    await writeFile(join(dir, "settings.yml"), "environment: 42\n", "utf8")
    const result = await loadSettings(dir)
    expect(result).toEqual({})
  })

  it("ignores unknown keys in settings.yml", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "environment: dev\nunknown_key: foo\n",
      "utf8",
    )
    const result = await loadSettings(dir)
    expect(result).toEqual({ environment: "dev" })
  })
})

describe("filestore.saveSettings", () => {
  it("writes environment to settings.yml", async () => {
    await saveSettings(dir, { environment: "production" })
    const content = await readFile(join(dir, "settings.yml"), "utf8")
    expect(content).toContain("environment: production")
  })

  it("round-trips saveSettings -> loadSettings", async () => {
    await saveSettings(dir, { environment: "staging" })
    const result = await loadSettings(dir)
    expect(result).toEqual({ environment: "staging" })
  })

  it("writes minimal file when environment is undefined", async () => {
    await saveSettings(dir, {})
    const content = await readFile(join(dir, "settings.yml"), "utf8")
    expect(content).toBe("{}\n")
  })

  it("creates directory if missing", async () => {
    const target = join(dir, "nested", "path")
    await saveSettings(target, { environment: "dev" })
    const content = await readFile(join(target, "settings.yml"), "utf8")
    expect(content).toContain("environment: dev")
  })

  it("overwrites existing settings.yml", async () => {
    await writeFile(join(dir, "settings.yml"), "environment: old\n", "utf8")
    await saveSettings(dir, { environment: "new" })
    const content = await readFile(join(dir, "settings.yml"), "utf8")
    expect(content).toContain("environment: new")
    expect(content).not.toContain("old")
  })
})

describe("filestore — nested folders", () => {
  it("loads nested directory structure as tree", async () => {
    await writeFile(
      join(dir, "root.yml"),
      yamlTmpl(makeReq({ id: "root", name: "Root" })),
    )

    await mkdir(join(dir, "auth"))
    await writeFile(
      join(dir, "auth", "login.yml"),
      yamlTmpl(makeReq({ id: "auth/login", name: "Login" })),
    )

    await mkdir(join(dir, "users"))
    await writeFile(
      join(dir, "users", "folder.yml"),
      "meta:\n  name: User Management\n  seq: 1\n",
    )
    await writeFile(
      join(dir, "users", "list.yml"),
      yamlTmpl(makeReq({ id: "users/list", name: "List Users" })),
    )

    const col = await filestore.loadCollection(dir)

    expect(col.items).toHaveLength(3)
    expect(col.items[0].type).toBe("folder")
    if (col.items[0].type === "folder") {
      expect(col.items[0].data.name).toBe("User Management")
      expect(col.items[0].data.children).toHaveLength(1)
    }
    if (col.items[2].type === "request") {
      expect(col.items[2].data.id).toBe("root")
    }
  })
})

describe("filestore — symlink handling", () => {
  it("skips symlink pointing outside collection root", async () => {
    await mkdir(join(dir, "outside-collection"))
    await writeFile(
      join(dir, "outside-collection", "x.yml"),
      yamlTmpl(makeReq({ name: "Outside" })),
    )
    await symlink(
      join(dir, "outside-collection"),
      join(dir, "outside-link"),
      "dir",
    )

    const col = await filestore.loadCollection(dir)
    const folderNames = col.items
      .filter((i) => i.type === "folder")
      .map((i) => (i.type === "folder" ? i.data.name : ""))
    expect(folderNames).not.toContain("outside-link")
  })

  it("follows symlink pointing to sibling directory inside collection", async () => {
    await mkdir(join(dir, "real-folder"))
    await writeFile(
      join(dir, "real-folder", "inside.yml"),
      yamlTmpl(makeReq({ name: "Inside", id: "real-folder/inside" })),
    )
    await symlink(join(dir, "real-folder"), join(dir, "link-to-real"), "dir")

    const col = await filestore.loadCollection(dir)
    const folderItem = col.items.find(
      (i) => i.type === "folder" && i.data.name === "real-folder",
    )
    expect(folderItem).toBeDefined()
  })

  it("detects symlink cycles and skips duplicate", async () => {
    await mkdir(join(dir, "cycle-a"))
    await writeFile(
      join(dir, "cycle-a", "a.yml"),
      yamlTmpl(makeReq({ name: "A", id: "cycle-a/a" })),
    )
    await symlink(
      join(dir, "cycle-a"),
      join(dir, "cycle-a", "link-to-self"),
      "dir",
    )

    const col = await filestore.loadCollection(dir)
    // Should load without infinite loop
    expect(
      col.items.some((i) => i.type === "folder" && i.data.name === "cycle-a"),
    ).toBe(true)
  })

  it("loads collection under path with symlinked parent components", async () => {
    await writeFile(
      join(dir, "root.yml"),
      yamlTmpl(makeReq({ id: "root", name: "Root" })),
    )
    await mkdir(join(dir, "sub"))
    await writeFile(
      join(dir, "sub", "nested.yml"),
      yamlTmpl(makeReq({ id: "sub/nested", name: "Nested" })),
    )

    const col = await filestore.loadCollection(dir)
    expect(col.items).toHaveLength(2)
    expect(
      col.items.some((i) => i.type === "request" && i.data.id === "root"),
    ).toBe(true)
    expect(col.items.some((i) => i.type === "folder")).toBe(true)
  })
})

describe("loadCollectionBrowse", () => {
  it("loads requests without migration writes", async () => {
    await writeFile(
      join(dir, "old-request.yml"),
      yamlTmpl(makeReq({ id: "old-request", name: "Legacy" })),
    )
    const { loadCollectionBrowse } = await import("../src/filestore/load")
    const col = await loadCollectionBrowse(dir)
    expect(col.items).toHaveLength(1)
    expect(col.items[0]!.type).toBe("request")
    expect(col.items[0]!.data.name).toBe("Legacy")
  })

  it("tolerates invalid YAML files", async () => {
    await writeFile(
      join(dir, "bad.yml"),
      "this is not valid yaml: : :\n\tbroken indentation",
    )
    await writeFile(
      join(dir, "good.yml"),
      yamlTmpl(makeReq({ id: "good", name: "Good" })),
    )
    const { loadCollectionBrowse } = await import("../src/filestore/load")
    const col = await loadCollectionBrowse(dir)
    expect(col.items).toHaveLength(1)
    expect(col.items[0]!.data.name).toBe("Good")
  })

  it("returns empty items for non-existent directory", async () => {
    const { loadCollectionBrowse } = await import("../src/filestore/load")
    const col = await loadCollectionBrowse("/tmp/noodle-browse-nonexistent")
    expect(col.items).toHaveLength(0)
  })
})
