import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectionAudit,
  collectionInspect,
  collectionList,
  collectionRun,
  environmentSet,
  requestCreate,
  requestRun,
  validateId,
} from "../src/app/services"
import { collection as collectionCommand } from "../src/app/commands/automation"
import { env } from "../src/env"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-automation-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("automation services", () => {
  it("returns no tree for a directory that is not a collection root", async () => {
    await mkdir(join(dir, "other-collection"))
    await writeFile(
      join(dir, "other-collection", "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
      "utf8",
    )
    expect(await collectionList(dir)).toEqual({ path: dir, tree: [] })
  })

  it("rejects non-collection roots for all collection operations", async () => {
    await expect(collectionInspect(dir)).rejects.toThrow(
      "not a collection root",
    )
    await expect(collectionAudit(dir, false)).rejects.toThrow(
      "not a collection root",
    )
    await expect(collectionRun(dir)).rejects.toThrow("not a collection root")
    await expect(
      requestCreate("request", "https://example.com", "GET", dir),
    ).rejects.toThrow("not a collection root")
    await expect(requestRun("request", dir)).rejects.toThrow(
      "not a collection root",
    )
    await expect(
      environmentSet("TOKEN", "value", "development", dir),
    ).rejects.toThrow("not a collection root")
  })

  it("defaults collection creation to the current directory", () => {
    const subCommands = collectionCommand.subCommands as {
      create: { args: { output: { default: string } } }
    }
    expect(subCommands.create.args.output.default).toBe(".")
  })

  it("creates collection-relative requests and reports them during inspection", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n", "utf8")
    await requestCreate("nested/ping", "https://example.com", "GET", dir)
    const result = await collectionInspect(dir)
    expect(result.requestCount).toBe(1)
    expect(result.tree).toEqual([
      {
        type: "folder",
        path: "nested",
        name: "nested",
        children: [
          {
            type: "request",
            id: "nested/ping",
            name: "ping",
            method: "GET",
            url: "https://example.com",
          },
        ],
      },
    ])
  })

  it("sets existing environment values and re-enables disabled variables", async () => {
    const envDir = join(dir, ".environments")
    await env.saveEnvironment(envDir, {
      name: "development",
      vars: {},
      disabledVars: { TOKEN: "old" },
    })
    await environmentSet("TOKEN", "new", "development", dir)
    expect(await env.loadEnvironment(envDir, "development")).toMatchObject({
      vars: { TOKEN: "new" },
      disabledVars: undefined,
    })
  })

  it("reports multiple invalid files without writing until fixed", async () => {
    await mkdir(join(dir, ".environments"))
    await writeFile(join(dir, "bad.yml"), "not: a request\n", "utf8")
    await writeFile(join(dir, ".environments", "bad.env"), "invalid\n", "utf8")
    const original = await readFile(join(dir, "bad.yml"), "utf8")
    const result = await collectionAudit(dir, false)
    expect(result.valid).toBe(false)
    expect(result.issues).toHaveLength(2)
    expect(await readFile(join(dir, "bad.yml"), "utf8")).toBe(original)
  })

  it("rejects traversal request IDs", () => {
    expect(() => validateId("../secret")).toThrow(
      'invalid request id "../secret"',
    )
  })
})
