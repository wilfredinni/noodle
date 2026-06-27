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

  it("lists .env files sorted alphabetically, stripped of extension", async () => {
    await writeFile(join(dir, "zebra.env"), "z=zebra\n", "utf8")
    await writeFile(join(dir, "alpha.env"), "a=alpha\n", "utf8")
    await writeFile(join(dir, "mid.env"), "m=mid\n", "utf8")
    const out = await env.listEnvironments(dir)
    expect(out).toEqual(["alpha", "mid", "zebra"])
  })

  it("ignores .yml and non-env files", async () => {
    await writeFile(join(dir, "a.env"), "x=y\n", "utf8")
    await writeFile(join(dir, "b.yml"), "name: b\nvars:\n  x: y\n", "utf8")
    await writeFile(join(dir, "c.txt"), "hello", "utf8")
    const out = await env.listEnvironments(dir)
    expect(out).toEqual(["a"])
  })

  it("ignores subdirectories", async () => {
    await writeFile(join(dir, "a.env"), "x=y\n", "utf8")
    await mkdir(join(dir, "subdir.env"))
    const out = await env.listEnvironments(dir)
    expect(out).toEqual(["a"])
  })
})
