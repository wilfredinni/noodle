import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { lang } from "../../src/lang"
import { send } from "../../src/requests/send"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { saveTimelineEntry, loadTimeline } from "../../src/filestore/timeline"
import type { Request } from "../../src/schema"

const command = process.env.NOODLE_TEST_BINARY
  ? [process.env.NOODLE_TEST_BINARY]
  : [process.execPath, "src/app/cli.ts"]
const payload = Uint8Array.from({ length: 256 }, (_, index) => index)
let dir: string
let server: ReturnType<typeof Bun.serve>
let hits: number
const request = (
  path = "/binary",
  overrides: Partial<Request> = {},
): Request => ({
  id: "file",
  name: "File",
  method: "GET",
  url: `http://127.0.0.1:${server.port}${path}`,
  headers: {},
  params: [],
  timeout: 0,
  ...overrides,
})
const save = (req: Request) =>
  writeFile(join(dir, "file.yml"), lang.serializeRequest(req))
async function cli(...args: string[]) {
  const child = Bun.spawn([...command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code }
}
const run = (...args: string[]) =>
  cli(
    "request",
    "run",
    "file",
    "--collection",
    dir,
    "--noproxy",
    "--json",
    ...args,
  )
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-binary-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  hits = 0
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      hits++
      const path = new URL(req.url).pathname
      if (path === "/redacted-text" || path === "/redacted-binary")
        return new Response("known-token", {
          headers: {
            "Content-Type":
              path === "/redacted-text"
                ? "text/plain"
                : "application/octet-stream",
            "Content-Disposition": "attachment; filename=known-token.dat",
          },
        })
      if (path === "/text")
        return new Response("\ufeffhéllo\n", {
          headers: { "Content-Type": "text/plain" },
        })
      if (path === "/empty")
        return new Response(null, {
          headers: { "Content-Type": "application/octet-stream" },
        })
      if (path === "/gzip")
        return new Response(Bun.gzipSync(payload), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "gzip",
          },
        })
      return new Response(payload, {
        status: path === "/error" ? 422 : 200,
        headers:
          path === "/missing"
            ? {}
            : {
                "Content-Type": "application/octet-stream",
                "Content-Disposition":
                  "attachment; filename*=UTF-8''all%20bytes.bin",
                "Set-Cookie": "token=secret-cookie",
              },
      })
    },
  })
})
afterEach(async () => {
  server.stop(true)
  await rm(dir, { recursive: true, force: true })
})

describe("binary responses and downloads", () => {
  it("rejects a parent symlink installed during HTTP without leaking the received bytes", async () => {
    server.stop(true)
    const attacker = join(dir, "attacker")
    const missing = join(dir, "missing")
    await mkdir(attacker)
    if (process.platform === "darwin") {
      const acl = Bun.spawnSync([
        "chmod",
        "+a",
        "everyone allow read,file_inherit",
        attacker,
      ])
      expect(acl.exitCode).toBe(0)
    }
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch() {
        await symlink(
          attacker,
          missing,
          process.platform === "win32" ? "junction" : "dir",
        )
        return new Response(payload, {
          status: 422,
          headers: { "Content-Type": "application/octet-stream" },
        })
      },
    })
    await save(request())
    const result = await run("--output", join(missing, "response.bin"))
    expect(result.code).toBe(1)
    expect(await readdir(attacker)).toEqual([])
    const data = JSON.parse(result.stdout).data.result
    expect(data.response.status).toBe(422)
    expect(data.response.outputFile).toBeUndefined()
    expect(data.failureCategories).toEqual(["execution", "http"])
  })
  it("preserves non-enumerable payloads through the shared lifecycle", async () => {
    const result = await executeRequestLifecycle({
      request: request(),
      runScope: new RunScope(),
    })
    expect(result.status).toBe("done")
    if (result.status !== "done") throw result.error
    expect(result.response.bodyBytes).toEqual(payload)
    expect(Object.keys(result.response)).not.toContain("bodyBytes")
    expect(JSON.stringify(result.response)).not.toContain("bodyBytes")
  })
  it("keeps original file bytes independent of redacted text and binary diagnostics", async () => {
    for (const path of ["/redacted-text", "/redacted-binary"]) {
      await save(
        request(path, { auth: { type: "bearer", token: "known-token" } }),
      )
      const output = join(dir, "known-token", `${path.slice(1)}.dat`)
      const result = await run("--output", output)
      expect(result.code).toBe(0)
      expect(await readFile(output, "utf8")).toBe("known-token")
      expect(result.stdout).not.toContain("known-token")
      const response = JSON.parse(result.stdout).data.result.response
      expect(response.outputFile).toContain("[REDACTED]")
      if (path === "/redacted-text") expect(response.body).toBe("[REDACTED]")
      else expect(response.filename).toBe("[REDACTED].dat")
    }
  })
  it("receives all byte values, empty bodies, missing MIME and decompressed payloads exactly", async () => {
    for (const path of ["/binary", "/missing", "/gzip", "/empty"]) {
      const response = await send(request(path))
      expect(response.bodyKind).toBe("binary")
      expect(response.body).toBe("")
      expect(response.bodyBytes).toEqual(
        path === "/empty" ? new Uint8Array() : payload,
      )
      expect(Object.keys(response)).not.toContain("bodyBytes")
      expect(JSON.stringify(response)).not.toContain("bodyBytes")
      expect(
        response.network?.find((event) => event.type === "body")?.message,
      ).toContain(`${response.bodyBytes!.length} bytes`)
    }
  })
  it("saves CLI payloads without exposing binary bytes in JSON or altering text bytes", async () => {
    for (const path of ["/binary", "/gzip", "/empty", "/text"]) {
      await save(request(path))
      const output = join(dir, "downloads", `${path.slice(1)}.dat`)
      const result = await run("-o", output)
      expect(result.code).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.stdout.trim().split("\n")).toHaveLength(1)
      const response = JSON.parse(result.stdout).data.result.response
      expect(response.outputFile).toBe(output)
      expect(response.bodyBytes).toBeUndefined()
      expect(new Uint8Array(await readFile(output))).toEqual(
        path === "/text"
          ? new TextEncoder().encode("\ufeffhéllo\n")
          : path === "/empty"
            ? new Uint8Array()
            : payload,
      )
      if (path !== "/text") {
        expect(response.body).toBeUndefined()
        expect(response.bodyKind).toBe("binary")
        expect(response.size).toBe(path === "/empty" ? 0 : 256)
      } else {
        expect(response.body).toBe("héllo\n")
        expect(response.bodyKind).toBeUndefined()
      }
    }
  })
  it("keeps HTTP, post, capture and assertion failures while saving the completed response", async () => {
    await save(
      request("/error", {
        scripts: { post: 'throw Error("post failed")' },
        captures: { missing: { value: "body.value", enabled: true } },
        assertions: [{ expression: "status", operator: "equals", value: 200 }],
      }),
    )
    const output = join(dir, "error.bin")
    const result = await run("--output", output)
    expect(result.code).toBe(1)
    expect(new Uint8Array(await readFile(output))).toEqual(payload)
    const data = JSON.parse(result.stdout).data.result
    expect(data.response.status).toBe(422)
    expect(data.failureCategories).toEqual([
      "script",
      "http",
      "capture",
      "assertion",
    ])
  })
  it("rejects existing or invalid paths before HTTP and creates no file on pre/transport failure", async () => {
    await save(request())
    const output = join(dir, "exists.bin")
    await writeFile(output, "keep")
    for (const target of [output, "", dir, join(output, "child")])
      expect((await run("--output", target)).code).toBe(2)
    expect(hits).toBe(0)
    expect(await readFile(output, "utf8")).toBe("keep")
    const absent = join(dir, "absent.bin")
    await save(request("/binary", { scripts: { pre: 'throw Error("stop")' } }))
    expect((await run("--output", absent)).code).toBe(1)
    expect(await lstat(absent).catch(() => null)).toBeNull()
    expect(hits).toBe(0)
    await save(request("/binary", { url: "http://127.0.0.1:1/" }))
    expect((await run("--output", absent)).code).toBe(1)
    expect(await lstat(absent).catch(() => null)).toBeNull()
  })
  it("preserves response diagnostics if a destination appears during HTTP", async () => {
    server.stop(true)
    const output = join(dir, "raced.bin")
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch() {
        await writeFile(output, "other writer")
        return new Response(payload, {
          status: 422,
          headers: { "Content-Type": "application/octet-stream" },
        })
      },
    })
    await save(request())
    const result = await run("--output", output)
    expect(result.code).toBe(1)
    const data = JSON.parse(result.stdout).data.result
    expect(data.response.status).toBe(422)
    expect(data.failureCategories).toEqual(["execution", "http"])
    expect(data.response.outputFile).toBeUndefined()
    expect(await readFile(output, "utf8")).toBe("other writer")
  })
  it("stores only binary metadata in history and collection results", async () => {
    const req = request()
    const response = await send(req)
    const entry = buildTimelineEntry(req, { status: "done", response })
    expect(entry.response).toMatchObject({
      bodyKind: "binary",
      size: 256,
      contentType: "application/octet-stream",
      filename: "all bytes.bin",
    })
    expect(entry.response!.body).toBeUndefined()
    expect(entry.response!.headers["set-cookie"]).toBe("[REDACTED]")
    await saveTimelineEntry(dir, req.id, entry)
    expect((await loadTimeline(dir, req.id))[0]!.response!.bodyKind).toBe(
      "binary",
    )
    expect(await readdir(join(dir, ".timeline"))).toEqual(["file.yml"])
    await save(req)
    const result = await cli("collection", "run", dir, "--noproxy", "--json")
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout).data.results[0].response).toMatchObject({
      bodyKind: "binary",
      size: 256,
    })
    expect(result.stdout).not.toContain("bodyBytes")
  })
})
