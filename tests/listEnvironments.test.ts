import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "../src/env"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-envlist-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("listEnvironments", () => {
  it("returns [] when dir does not exist", async () => {
    await expect(env.listEnvironments(join(dir, "missing"))).resolves.toEqual(
      [],
    )
  })

  it("returns [] for an empty dir", async () => {
    await expect(env.listEnvironments(dir)).resolves.toEqual([])
  })

  it("lists .yml files sorted alphabetically, stripped of extension", async () => {
    await writeFile(join(dir, "zebra.yml"), "name: z\nvars:\n  x: y\n", "utf8")
    await writeFile(join(dir, "alpha.yml"), "name: a\nvars:\n  x: y\n", "utf8")
    await writeFile(join(dir, "mid.yml"), "name: m\nvars:\n  x: y\n", "utf8")
    const out = await env.listEnvironments(dir)
    expect(out).toEqual(["alpha", "mid", "zebra"])
  })

  it("ignores .yaml and non-yml files", async () => {
    await writeFile(join(dir, "a.yml"), "name: a\nvars:\n  x: y\n", "utf8")
    await writeFile(join(dir, "b.yaml"), "name: b\nvars:\n  x: y\n", "utf8")
    await writeFile(join(dir, "c.txt"), "hello", "utf8")
    const out = await env.listEnvironments(dir)
    expect(out).toEqual(["a"])
  })

  it("ignores subdirectories", async () => {
    await writeFile(join(dir, "a.yml"), "name: a\nvars:\n  x: y\n", "utf8")
    await mkdir(join(dir, "subdir.yml"))
    const out = await env.listEnvironments(dir)
    expect(out).toEqual(["a"])
  })
})
