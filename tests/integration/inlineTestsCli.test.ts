import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"

const command = process.env.NOODLE_TEST_BINARY
  ? [process.env.NOODLE_TEST_BINARY]
  : [process.execPath, "src/app/cli.ts"]
let dir: string
let server: ReturnType<typeof Bun.serve>
let url: string
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
  expect(stderr).toBe("")
  return { stdout, code }
}
const save = (id: string, tests?: string, overrides: Partial<Request> = {}) =>
  writeFile(
    join(dir, `${id}.yml`),
    lang.serializeRequest({
      id,
      name: id,
      method: "GET",
      url,
      timeout: 0,
      headers: {},
      params: [],
      ...(tests !== undefined ? { tests } : {}),
      ...overrides,
    }),
  )
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-tests-cli-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => Response.json({ id: 7 }),
  })
  url = `http://127.0.0.1:${server.port}/`
})
afterEach(async () => {
  server?.stop(true)
  await rm(dir, { recursive: true, force: true })
})

describe("inline tests CLI and compiled binary", () => {
  it("preserves structured tests, logs, failures, summaries, exit codes and downloads", async () => {
    await save(
      "a",
      'test("pass",()=>expect(noodle.response.json().id).toBe(7)); test("fail",()=>expect(1).toBe(2)); console.log("secret-token");',
      { scripts: { pre: 'noodle.request.auth.setBearer("secret-token")' } },
    )
    await save("b", 'test("later",()=>{})')
    const output = join(dir, "download.json")
    const request = await cli(
      "request",
      "run",
      "a",
      "--collection",
      dir,
      "--noproxy",
      "--output",
      output,
      "--json",
    )
    expect(request.code).toBe(1)
    const result = JSON.parse(request.stdout).data.result
    expect(result.failureCategories).toEqual(["test"])
    expect(
      result.tests.results.map((test: { passed: boolean }) => test.passed),
    ).toEqual([true, false])
    expect(result.tests.logs).toEqual([{ level: "log", message: "[REDACTED]" }])
    expect(await readFile(output, "utf8")).toBe('{"id":7}')
    const human = await cli(
      "request",
      "run",
      "a",
      "--collection",
      dir,
      "--noproxy",
    )
    expect(human.code).toBe(1)
    expect(human.stdout).toContain("Tests: 1 passed, 1 failed")
    expect(human.stdout).toContain("fail: Expected value to satisfy toBe")
    expect(human.stdout).not.toContain("secret-token")
    const collection = await cli(
      "collection",
      "run",
      dir,
      "--noproxy",
      "--fail-fast",
      "--json",
    )
    expect(collection.code).toBe(1)
    const data = JSON.parse(collection.stdout).data
    expect(data.summary).toMatchObject({
      testPasses: 1,
      testFailures: 1,
      testScriptErrors: 0,
      skipped: 1,
      failureCategories: ["test"],
    })
    expect(data.skipped).toEqual([{ id: "b", reason: "fail-fast" }])
  })
  it("recovers after resource limits, preserves completed tests, and fails top-level errors", async () => {
    await save(
      "a",
      'test("before",()=>{}); test("timeout",()=>{while(true){}})',
    )
    await save(
      "b",
      'test("before",()=>{}); test("memory",()=>{const a=[];while(true)a.push(new Array(10000).fill("x"))})',
    )
    await save("c", 'test("before",()=>{}); throw Error("top-level")')
    await save(
      "d",
      'test("recovered",()=>expect(noodle.response.json().id).toBe(7))',
    )
    const run = await cli("collection", "run", dir, "--noproxy", "--json")
    expect(run.code).toBe(1)
    const data = JSON.parse(run.stdout).data
    expect(data.results.map((result: { ok: boolean }) => result.ok)).toEqual([
      false,
      false,
      false,
      true,
    ])
    expect(data.results[0].tests.error.name).toBe("ScriptTimeoutError")
    expect(data.results[1].tests.error.name).toBe("ScriptMemoryLimitError")
    expect(data.results[2].tests.error.message).toBe("top-level")
    expect(
      data.results
        .slice(0, 3)
        .every(
          (result: { tests: { results: { name: string }[] } }) =>
            result.tests.results[0]?.name === "before",
        ),
    ).toBe(true)
    expect(data.summary).toMatchObject({
      testPasses: 4,
      testFailures: 0,
      testScriptErrors: 3,
    })
  })
  it("omits new output for legacy requests and reports unevaluated tests after pre failure", async () => {
    await save("legacy")
    const legacy = await cli("collection", "run", dir, "--noproxy", "--json")
    expect(legacy.code).toBe(0)
    const data = JSON.parse(legacy.stdout).data
    expect(data.results[0]).not.toHaveProperty("tests")
    expect(data.summary).not.toHaveProperty("testPasses")
    await save("pre", 'test("never",()=>{})', {
      scripts: { pre: 'throw Error("pre failed")' },
    })
    const run = await cli(
      "request",
      "run",
      "pre",
      "--collection",
      dir,
      "--noproxy",
      "--json",
    )
    expect(run.code).toBe(1)
    expect(JSON.parse(run.stdout).data.result.tests).toEqual({
      evaluated: false,
      results: [],
      logs: [],
    })
    const human = await cli(
      "request",
      "run",
      "pre",
      "--collection",
      dir,
      "--noproxy",
    )
    expect(human.stdout).toContain("Tests: not evaluated")
  })
})
