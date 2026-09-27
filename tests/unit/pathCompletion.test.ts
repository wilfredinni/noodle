import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { collapseUserPath, expandUserPath } from "../../src/userPath"
import {
  getPathCompletionQuery,
  listPathCompletions,
} from "../../src/ui/path-completion/pathCompletion"

describe("home path completion", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "noodle-path-completion-"))
    await mkdir(join(root, "Alpha Folder"))
    await mkdir(join(root, "nested"))
    await writeFile(join(root, "Alpha.txt"), "alpha")
    await writeFile(join(root, "my-alpha.txt"), "alpha")
    await writeFile(join(root, ".secret"), "secret")
    await writeFile(join(root, "nested", "report final.pdf"), "report")
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("parses home-rooted queries and rejects traversal above the root", () => {
    expect(getPathCompletionQuery("@Doc", root)).toEqual({
      root,
      directory: root,
      query: "Doc",
      valueBase: "@/",
    })
    expect(getPathCompletionQuery("@/nested/rep", root)).toEqual({
      root,
      directory: join(root, "nested"),
      query: "rep",
      valueBase: "@/nested/",
    })
    expect(getPathCompletionQuery("@file(@/nested/rep)", root)).toEqual({
      root,
      directory: join(root, "nested"),
      query: "rep",
      valueBase: "@/nested/",
    })
    expect(getPathCompletionQuery("@/../", root)).toBeNull()
    expect(getPathCompletionQuery("plain/path", root)).toBeNull()
  })

  it("completes collection-relative paths without changing home shorthand", async () => {
    expect(getPathCompletionQuery("./nested/rep", undefined, root)).toEqual({
      root,
      directory: join(root, "nested"),
      query: "rep",
      valueBase: "./nested/",
    })
    const items = await listPathCompletions("./nested/report", {
      kind: "file",
      relativeRoot: root,
    })
    expect(items[0]?.value).toBe("./nested/report final.pdf")
  })

  it.skipIf(process.platform !== "win32")(
    "rejects paths on another drive or UNC share",
    () => {
      expect(
        getPathCompletionQuery("./D:/private/", undefined, "C:\\collection"),
      ).toBeNull()
      expect(
        getPathCompletionQuery("@/D:/private/", "C:\\collection"),
      ).toBeNull()
      expect(
        getPathCompletionQuery(
          "./\\\\other\\share\\private/",
          undefined,
          "\\\\server\\collection",
        ),
      ).toBeNull()
    },
  )

  it("sorts prefix matches first, directories before files, and preserves spaces", async () => {
    const items = await listPathCompletions("@alpha", {
      kind: "file",
      root,
    })
    expect(items.map((item) => item.value)).toEqual([
      "@/Alpha Folder/",
      "@/Alpha.txt",
      "@/my-alpha.txt",
    ])

    const nested = await listPathCompletions("@/nested/report", {
      kind: "file",
      root,
    })
    expect(nested[0]?.value).toBe("@/nested/report final.pdf")
  })

  it("filters script files while keeping directories and rejecting symlink escapes", async () => {
    const outside = await mkdtemp(join(tmpdir(), "noodle-path-outside-"))
    try {
      await writeFile(join(root, "check.js"), "")
      await writeFile(join(root, "check.JS"), "")
      await writeFile(join(outside, "escaped.js"), "")
      await symlink(join(outside, "escaped.js"), join(root, "escaped.js"))
      await symlink(outside, join(root, "escaped-folder"))
      const options = {
        kind: "file" as const,
        relativeRoot: root,
        fileExtension: ".js",
      }
      const items = await listPathCompletions("./", options)
      expect(items.map((item) => item.value)).toEqual([
        "./Alpha Folder/",
        "./nested/",
        "./check.js",
      ])
      expect(await listPathCompletions("./../", options)).toEqual([])
      expect(
        (await listPathCompletions("./nested/../check", options)).map(
          (item) => item.value,
        ),
      ).toEqual(["./check.js"])
      expect(await listPathCompletions("./escaped-folder/", options)).toEqual(
        [],
      )
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("shows hidden entries only for an explicit dot query", async () => {
    const regular = await listPathCompletions("@", { kind: "file", root })
    expect(regular.some((item) => item.name === ".secret")).toBe(false)

    const hidden = await listPathCompletions("@.", { kind: "file", root })
    expect(hidden.map((item) => item.name)).toContain(".secret")
  })

  it("filters files when completing a directory path", async () => {
    const items = await listPathCompletions("@", {
      kind: "directory",
      root,
    })
    expect(items.every((item) => item.type === "directory")).toBe(true)
  })

  it("expands only exact home shorthand values", () => {
    expect(expandUserPath("@", root)).toBe(root)
    expect(expandUserPath("@/nested/report final.pdf", root)).toBe(
      join(root, "nested", "report final.pdf"),
    )
    expect(expandUserPath("@report", root)).toBe("@report")
    expect(expandUserPath("./report.pdf", root)).toBe("./report.pdf")
  })

  it("collapses paths inside home without changing outside paths", () => {
    expect(collapseUserPath(root, root)).toBe("@/")
    expect(collapseUserPath(join(root, "nested"), root)).toBe("@/nested")
    expect(collapseUserPath(tmpdir(), root)).toBe(tmpdir())
  })
})
