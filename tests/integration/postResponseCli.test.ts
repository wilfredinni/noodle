import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"

// The same loopback checks run against development and the compiled binary.
const command = process.env.NOODLE_TEST_BINARY
  ? [process.env.NOODLE_TEST_BINARY]
  : [process.execPath, "src/app/cli.ts"]
let dir: string
let server: ReturnType<typeof Bun.serve>
let url: string
const request = (
  id: string,
  post: string,
  over: Partial<Request> = {},
): Request => ({
  id,
  name: id,
  method: "GET",
  url,
  timeout: 0,
  headers: {},
  params: [],
  scripts: { post },
  ...over,
})
const save = (req: Request) =>
  writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
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
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-post-cli-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      if (path === "/large")
        return new Response(
          JSON.stringify({ padding: "x".repeat(5 * 1024 * 1024 - 14) }),
        )
      if (path === "/oversize")
        return new Response("x".repeat(5 * 1024 * 1024 + 1))
      if (path === "/hostile-json")
        return new Response("[" + "{},".repeat(1_000_000) + "{}]")
      return Response.json(
        { id: 7, forwarded: new URL(req.url).searchParams.get("id") },
        { status: path === "/error" ? 422 : 200 },
      )
    },
  })
  url = `http://127.0.0.1:${server.port}/`
})
afterEach(async () => {
  server.stop(true)
  await rm(dir, { recursive: true, force: true })
})

describe("post-response CLI and compiled smoke", () => {
  it("preserves both phases and diagnostics in JSON and labels human output without logs", async () => {
    await save(
      request(
        "first",
        `console.info("private log"); throw Error("post failed")`,
        {
          url: `${url}error`,
          scripts: {
            pre: `console.info("pre private")`,
            post: `console.info("private log"); throw Error("post failed")`,
          },
          captures: { id: { value: "body.id", enabled: true } },
          assertions: [
            { expression: "status", operator: "equals", value: 200 },
          ],
        },
      ),
    )
    const json = await cli(
      "request",
      "run",
      "first",
      "--collection",
      dir,
      "--noproxy",
      "--json",
    )
    expect(json.code).toBe(1)
    expect(json.stderr).toBe("")
    const result = JSON.parse(json.stdout).data.result
    expect(result.failureCategories).toEqual(["script", "http", "assertion"])
    expect(result.response.status).toBe(422)
    expect(
      result.scripts.results.map((script: { phase: string }) => script.phase),
    ).toEqual(["pre", "post"])
    expect(result.captures.results[0].value).toBe(7)
    const human = await cli(
      "request",
      "run",
      "first",
      "--collection",
      dir,
      "--noproxy",
    )
    expect(human.code).toBe(1)
    expect(human.stdout).toContain("Pre-script: passed")
    expect(human.stdout).toContain("Post-script: failed")
    expect(human.stdout).not.toContain("private log")
    expect(human.stdout).not.toContain("pre private")
  })

  it("recovers in one collection process after hostile post allocation and deadlines", async () => {
    await save(
      request(
        "1-memory",
        `const a=[]; while(true) a.push("x".repeat(1024*1024))`,
      ),
    )
    await save(request("2-deadline", `while(true) {}`))
    await save(
      request("2-json-memory", `response.json()`, {
        url: `${url}hostile-json`,
      }),
    )
    await save(request("3-recovery", `run.set("id", response.json().id)`))
    await save(
      request(
        "4-consumer",
        `if (response.json().forwarded !== "7") throw Error("scope recovery")`,
        { url: `${url}?id=$id` },
      ),
    )
    const json = await cli("collection", "run", dir, "--noproxy", "--json")
    expect(json.code).toBe(1)
    const result = JSON.parse(json.stdout).data
    expect(result.results.map((item: { ok: boolean }) => item.ok)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ])
    expect(result.results[0].scripts.results[0].error.name).toMatch(
      /Script(?:MemoryLimit|Timeout)Error/,
    )
    expect(result.results[1].scripts.results[0].error.name).toBe(
      "ScriptTimeoutError",
    )
    expect(result.results[2].scripts.results[0].error.name).toBe(
      "ScriptMemoryLimitError",
    )
  })

  it("accepts exact-limit JSON and rejects oversized text without losing the response", async () => {
    await save(
      request(
        "large",
        `if (response.json().padding.length !== ${5 * 1024 * 1024 - 14}) throw Error("truncated")`,
        { url: `${url}large` },
      ),
    )
    expect(
      (
        await cli(
          "request",
          "run",
          "large",
          "--collection",
          dir,
          "--noproxy",
          "--json",
        )
      ).code,
    ).toBe(0)
    await save(
      request("oversize", `response.text()`, {
        url: `${url}oversize`,
        assertions: [{ expression: "status", operator: "equals", value: 200 }],
      }),
    )
    const json = await cli(
      "request",
      "run",
      "oversize",
      "--collection",
      dir,
      "--noproxy",
      "--json",
    )
    expect(json.code).toBe(1)
    const result = JSON.parse(json.stdout).data.result
    expect(result.response.body.length).toBe(5 * 1024 * 1024 + 1)
    expect(result.scripts.results[0].error.name).toBe(
      "ScriptApiValidationError",
    )
    expect(result.assertions.results[0].passed).toBe(true)
  })
})
