import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listEnvironmentsWithColors } from "../src/env/listWithColors"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-listcols-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("listEnvironmentsWithColors", () => {
  it("returns [] when dir does not exist", async () => {
    const out = await listEnvironmentsWithColors(join(dir, "missing"))
    expect(out).toEqual([])
  })

  it("returns [] for empty dir", async () => {
    const out = await listEnvironmentsWithColors(dir)
    expect(out).toEqual([])
  })

  it("lists .env files with undefined color when _color= not present", async () => {
    await writeFile(join(dir, "dev.env"), "host=localhost\nport=3000\n", "utf8")
    const out = await listEnvironmentsWithColors(dir)
    expect(out).toEqual([{ name: "dev", color: undefined }])
  })

  it("reads _color= from first line", async () => {
    await writeFile(
      join(dir, "staging.env"),
      "_color=warning\napi_key=abc\n",
      "utf8",
    )
    const out = await listEnvironmentsWithColors(dir)
    expect(out).toEqual([{ name: "staging", color: "warning" }])
  })

  it("ignores _color= on non-first lines", async () => {
    await writeFile(
      join(dir, "prod.env"),
      "api_key=live\n_color=primary\n",
      "utf8",
    )
    const out = await listEnvironmentsWithColors(dir)
    expect(out).toEqual([{ name: "prod", color: undefined }])
  })

  it("handles mix of envs with and without color", async () => {
    await writeFile(join(dir, "dev.env"), "x=y\n", "utf8")
    await writeFile(join(dir, "prod.env"), "_color=error\nkey=val\n", "utf8")
    await writeFile(
      join(dir, "staging.env"),
      "_color=success\nother=val\n",
      "utf8",
    )
    const out = await listEnvironmentsWithColors(dir)
    expect(out).toHaveLength(3)
    expect(out.find((e) => e.name === "dev")!.color).toBeUndefined()
    expect(out.find((e) => e.name === "prod")!.color).toBe("error")
    expect(out.find((e) => e.name === "staging")!.color).toBe("success")
  })

  it("ignores .yml and non-env files", async () => {
    await writeFile(join(dir, "a.env"), "x=y\n", "utf8")
    await writeFile(join(dir, "b.env"), "_color=info\nz=w\n", "utf8")
    await writeFile(join(dir, "c.yml"), "name: c\nvars:\n  x: y\n", "utf8")
    const out = await listEnvironmentsWithColors(dir)
    expect(out).toEqual([
      { name: "a", color: undefined },
      { name: "b", color: "info" },
    ])
  })
})
