import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expandUserPath } from "../../src/userPath"
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
      directory: root,
      query: "Doc",
      valueBase: "@/",
    })
    expect(getPathCompletionQuery("@/nested/rep", root)).toEqual({
      directory: join(root, "nested"),
      query: "rep",
      valueBase: "@/nested/",
    })
    expect(getPathCompletionQuery("@/../", root)).toBeNull()
    expect(getPathCompletionQuery("plain/path", root)).toBeNull()
  })

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
})
