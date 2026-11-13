import { afterEach, beforeEach, expect, it, spyOn } from "bun:test"
import type { CommandDef } from "citty"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { lang } from "../../src/lang"
import { collection } from "../../src/app/commands/automation"
import { responseFileNative } from "../../src/responseFileNative"
import type { Request } from "../../src/schema"
import { parseReport, reportCases } from "../unit/_junit"

const command = process.env.NOODLE_TEST_BINARY
  ? [process.env.NOODLE_TEST_BINARY]
  : [process.execPath, resolve("src/app/cli.ts")]
const secret = 'report-secret<&"-719284'
let dir: string
let server: ReturnType<typeof Bun.serve>
let hits: string[]
let entered: ReturnType<typeof Promise.withResolvers<void>>
let release: ReturnType<typeof Promise.withResolvers<void>>
let collision: string | undefined
const children = new Set<Bun.Subprocess<"ignore", "pipe", "pipe">>()

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-report-cli-"))
  entered = Promise.withResolvers<void>()
  release = Promise.withResolvers<void>()
  hits = []
  collision = undefined
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      hits.push(path)
      if (collision) await writeFile(collision, "another writer")
      if (path === "/hold") {
        entered.resolve()
        await release.promise
      }
      if (path === "/binary")
        return new Response(new Uint8Array([0, 255, 128, 1]), {
          headers: { "content-type": "application/octet-stream" },
        })
      return Response.json(
        { token: secret, path },
        {
          status: path === "/fail" ? 500 : 200,
          headers: {
            "set-cookie": "session=private-cookie; Path=/",
            date: "Thu, 01 Jan 2026 00:00:00 GMT",
          },
        },
      )
    },
  })
  await writeFile(
    join(dir, "settings.yml"),
    "cookies:\n  enabled: false\nenvironment: ci\n",
  )
  await mkdir(join(dir, ".environments"))
  await writeFile(
    join(dir, ".environments", "ci.env"),
    "# @secret API_TOKEN\nAPI_TOKEN=\n",
  )
  await save("a")
})
afterEach(async () => {
  release.resolve()
  for (const child of children) {
    if (child.exitCode === null) child.kill()
    await child.exited
  }
  children.clear()
  server?.stop(true)
  await rm(dir, { recursive: true, force: true })
})

function save(id: string, fields: Partial<Request> = {}) {
  return writeFile(
    join(dir, `${id}.yml`),
    lang.serializeRequest({
      id,
      name: id,
      method: "GET",
      url: `http://127.0.0.1:${server.port}/${id}`,
      headers: {},
      params: [],
      timeout: 0,
      ...fields,
    }),
  )
}

function start(args: string[]) {
  const child = Bun.spawn(
    [...command, "collection", "run", dir, "--env", "ci", "--noproxy", ...args],
    {
      cwd: dir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1", API_TOKEN: secret },
    },
  )
  children.add(child)
  return {
    child,
    result: Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]).then(([stdout, stderr, code]) => ({ stdout, stderr, code })),
  }
}
const run = (args: string[]) => start(args).result
const formats = ["json", "junit"] as const
const flags = (format: (typeof formats)[number], output: string) =>
  format === "json"
    ? ["--json", "--output", output]
    : ["--reporter", "junit", "--output", output]

it("rejects unknown options before scripts, HTTP or report preparation", async () => {
  const report = join(dir, "report.json")
  await save("a", {
    method: "POST",
    scripts: {
      pre: `await noodle.sendRequest({ method: "GET", url: "http://127.0.0.1:${server.port}/pre" })`,
    },
  })
  for (const option of ["--dry-run", "--dry-rnu=private-value"]) {
    const result = await run(["a", "--json", "-o", report, option])
    expect(result.code).toBe(2)
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      data: null,
      errors: [`Unknown option: ${option.split("=")[0]}`],
    })
    expect(result.stderr).toBe("")
    expect(hits).toEqual([])
    expect(await Bun.file(report).exists()).toBe(false)
  }
  for (const option of ["--dry-run", "-?"]) {
    const ambiguous = await run(["a", "--json=true", "-o", option])
    expect(ambiguous.code).toBe(2)
    expect(JSON.parse(ambiguous.stdout).data).toBeNull()
    expect(hits).toEqual([])
    expect(await Bun.file(join(dir, option)).exists()).toBe(false)
  }
  expect((await run(["--json", "--", "a"])).code).toBe(0)
  expect(hits).toEqual(["/pre", "/a"])
})

it("retains JSON and human output compatibility when writing reports", async () => {
  const plainJson = await run(["--json"])
  const path = join(dir, "report.json")
  const savedJson = await run(["--json", "-o", path])
  expect(savedJson.code).toBe(0)
  expect(savedJson.stderr).toBe("")
  expect(await readFile(path, "utf8")).toBe(savedJson.stdout)
  expect(savedJson.stdout.trim().split("\n")).toHaveLength(1)
  const original = JSON.parse(plainJson.stdout)
  const saved = JSON.parse(savedJson.stdout)
  for (const envelope of [original, saved]) {
    expect(envelope.data.results[0].durationMs).toBeGreaterThanOrEqual(0)
    delete envelope.data.summary.durationMs
    for (const result of envelope.data.results) {
      delete result.durationMs
      delete result.response.timeMs
    }
  }
  expect(saved).toEqual(original)
  const human = await run([])
  const junit = await run(flags("junit", join(dir, "report.xml")))
  expect(junit.code).toBe(0)
  expect(junit.stderr).toBe("")
  expect(junit.stdout.replace(/[\d.]+ms/g, "TIME")).toBe(
    human.stdout.replace(/[\d.]+ms/g, "TIME"),
  )
  expect(
    parseReport(await readFile(join(dir, "report.xml"), "utf8")).attributes,
  ).toMatchObject({ tests: "1", failures: "0", errors: "0" })
})

it("rejects conflicting formats and invalid or existing paths before HTTP", async () => {
  const output = join(dir, "output.xml")
  const combinations = [
    ["--json", "--reporter", "junit", "--output", output],
    ["--reporter", "other", "--output", output],
    ["--reporter", "junit"],
    ["--output", output],
    ["--json", "--output="],
    ["--reporter", "junit", "--output", dir],
    ["--json", "--output", join(dir, "a.yml")],
    ["--json", "--output", join(dir, "a.yml", "file")],
  ]
  for (const args of combinations) {
    const result = await run(args)
    expect(result.code).toBe(2)
    if (args.includes("--json")) {
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "error",
        data: null,
      })
      expect(result.stderr).toBe("")
    } else {
      expect(result.stdout).toBe("")
      expect(result.stderr).toContain("configuration error:")
    }
  }
  expect(hits).toEqual([])
  expect(await readdir(dir)).not.toContain("output.xml")
})

it("keeps binary reports metadata-only", async () => {
  await save("a", { url: `http://127.0.0.1:${server.port}/binary` })
  const jsonPath = join(dir, "binary.json")
  const json = await run(flags("json", jsonPath))
  expect(json.code).toBe(0)
  const response = JSON.parse(json.stdout).data.results[0].response
  expect(response).toMatchObject({
    bodyKind: "binary",
    size: 4,
    contentType: "application/octet-stream",
  })
  expect(response).not.toHaveProperty("body")
  expect(response).not.toHaveProperty("bodyBytes")
  expect(await readFile(jsonPath, "utf8")).toBe(json.stdout)
  const xmlPath = join(dir, "binary.xml")
  expect((await run(flags("junit", xmlPath))).code).toBe(0)
  expect(reportCases(await readFile(xmlPath, "utf8"))[0]!.children).toEqual([])
})

it("retains configuration exit 2 when writing its report also fails", async () => {
  const runCommand = (collection.subCommands as { run: CommandDef }).run
  const previousExit = process.exitCode
  const output: string[] = []
  const stdout = spyOn(process.stdout, "write").mockImplementation((text) => {
    output.push(String(text))
    return true
  })
  const failing = spyOn(responseFileNative(), "writeReport").mockRejectedValue(
    new Error("disk full"),
  )
  try {
    await runCommand.run!({
      args: {
        _: [dir, "missing"],
        path: dir,
        json: true,
        noproxy: true,
        delay: "0",
        output: join(dir, "configuration.json"),
      },
      rawArgs: [dir, "missing", "--json"],
    } as never)
    expect(process.exitCode).toBe(2)
    expect(output).toHaveLength(1)
    const envelope = JSON.parse(output[0]!)
    expect(envelope.data.failure.category).toBe("configuration")
    expect(envelope.errors).toEqual([
      envelope.data.failure.message,
      "Unable to write collection report",
    ])
    expect(hits).toEqual([])
    expect(await readdir(dir)).not.toContain("configuration.json")
  } finally {
    failing.mockRestore()
    stdout.mockRestore()
    process.exitCode = previousExit ?? 0
  }
})

for (const format of formats) {
  it(`writes ${format} for a failed run, with all sanitized response diagnostics`, async () => {
    await save("a", {
      url: `http://127.0.0.1:${server.port}/fail`,
      auth: { type: "bearer", token: "$API_TOKEN" },
      scripts: {
        post: 'console.log(noodle.env.get("API_TOKEN")); throw new Error(noodle.env.get("API_TOKEN"))',
      },
      captures: { missing: { value: "body.missing", enabled: true } },
      assertions: [
        { expression: "body.token", operator: "equals", value: "wrong" },
      ],
      tests:
        'test("body", () => expect(noodle.response.json().token).toBe("wrong"))',
    })
    const path = join(dir, `result.${format}`)
    const result = await run(flags(format, path))
    expect(result.code).toBe(1)
    expect(result.stderr).toBe("")
    const report = await readFile(path, "utf8")
    expect(report).not.toContain(secret)
    expect(report).not.toContain("private-cookie")
    if (format === "json") {
      expect(report).toBe(result.stdout)
      expect(
        JSON.parse(JSON.parse(report).data.results[0].response.body).token,
      ).toBe("[REDACTED]")
      expect(JSON.parse(report)).toMatchObject({
        status: "error",
        errors: ["command failed"],
        data: {
          results: [
            {
              failureCategories: [
                "script",
                "http",
                "capture",
                "assertion",
                "test",
              ],
            },
          ],
        },
      })
    } else {
      const error = reportCases(report)[0]!.children[0]!
      expect(error.name).toBe("error")
      for (const diagnostic of [
        "HTTP: 500",
        "Capture $missing",
        "Assertion body.token",
        "Test body",
        "[REDACTED]",
      ])
        expect(error.text).toContain(diagnostic)
      expect(error.text).not.toContain(secret)
      expect(reportCases(report)[0]!.children.at(-1)!.text).not.toContain(
        secret,
      )
    }
  })

  it(`writes ${format} for configuration failure and retains exit 2`, async () => {
    const path = join(dir, `configuration.${format}`)
    const result = await run(["missing", ...flags(format, path)])
    expect(result.code).toBe(2)
    expect(hits).toEqual([])
    const report = await readFile(path, "utf8")
    if (format === "json") {
      expect(report).toBe(result.stdout)
      expect(JSON.parse(report).data.failure.category).toBe("configuration")
    } else
      expect(parseReport(report).attributes).toMatchObject({
        tests: "1",
        errors: "1",
        skipped: "0",
      })
  })

  for (const failed of [false, true]) {
    it(`makes a ${format} publication failure nonzero while retaining ${failed ? "failed" : "successful"} execution results`, async () => {
      if (failed)
        await save("a", { url: `http://127.0.0.1:${server.port}/fail` })
      collision = join(dir, `collision.${format}`)
      const result = await run(flags(format, collision))
      expect(result.code).toBe(1)
      expect(await readFile(collision, "utf8")).toBe("another writer")
      expect((await readdir(dir)).some((name) => name.endsWith(".tmp"))).toBe(
        false,
      )
      if (format === "json") {
        const envelope = JSON.parse(result.stdout)
        expect(envelope).toMatchObject({
          status: "error",
          data: { failed, summary: { executed: 1 } },
        })
        expect(envelope.errors).toEqual([
          ...(failed ? ["command failed"] : []),
          "Unable to write collection report",
        ])
        expect(result.stderr).toBe("")
      } else {
        expect(result.stdout).toContain("Summary:")
        expect(result.stderr).toBe("error: Unable to write collection report\n")
      }
    })
  }
}

it("distinguishes repeated iterations and stages, including setup failure and fail-fast cleanup", async () => {
  await writeFile(
    join(dir, "settings.yml"),
    "cookies:\n  enabled: false\nhooks:\n  setup: setup\n  teardown: teardown\n",
  )
  await save("setup", { url: `http://127.0.0.1:${server.port}/fail` })
  await save("teardown")
  const data = join(dir, "rows.json")
  await writeFile(data, '[{"row":1},{"row":2}]')
  for (const failFast of [false, true]) {
    const path = join(dir, `hooks-${failFast}.xml`)
    const result = await run([
      "--data",
      data,
      ...(failFast ? ["--fail-fast"] : []),
      ...flags("junit", path),
    ])
    expect(result.code).toBe(1)
    const text = await readFile(path, "utf8")
    const cases = reportCases(text)
    expect(cases.map((node) => node.attributes.name)).toEqual([
      "setup [iteration 1] [setup]",
      "a [iteration 1] [main]",
      "teardown [iteration 1] [teardown]",
      "setup [iteration 2] [setup]",
      "a [iteration 2] [main]",
      "teardown [iteration 2] [teardown]",
    ])
    expect(cases[1]!.children[0]!.text).toBe("setup-failed")
    expect(cases[2]!.children).toEqual([])
    if (failFast)
      for (const node of cases.slice(3))
        expect(node.children[0]!.text).toBe("fail-fast")
    expect(parseReport(text).attributes).toMatchObject({
      tests: "6",
      failures: failFast ? "1" : "2",
      errors: "0",
      skipped: failFast ? "4" : "2",
    })
  }
})

// Windows kill() terminates forcibly; emitted-signal coverage lives in collectionCancellationCli.test.ts.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  for (const format of formats) {
    it.skipIf(process.platform === "win32")(
      `writes partial ${format} on ${signal} and preserves exit 130`,
      async () => {
        await save("b", { url: `http://127.0.0.1:${server.port}/hold` })
        await save("c")
        const path = join(dir, `cancel.${format}`)
        const running = start(flags(format, path))
        await entered.promise
        running.child.kill(signal)
        const result = await running.result
        expect(result.code).toBe(130)
        expect(result.stderr).toBe("")
        expect(hits).toEqual(["/a", "/hold"])
        const report = await readFile(path, "utf8")
        if (format === "json") {
          expect(report).toBe(result.stdout)
          expect(JSON.parse(report)).toMatchObject({
            status: "error",
            errors: ["Collection run cancelled"],
            data: {
              cancelled: true,
              summary: {
                selected: 3,
                completed: 1,
                cancelled: 1,
                unstarted: 1,
              },
            },
          })
        } else {
          expect(parseReport(report).attributes).toMatchObject({
            tests: "3",
            failures: "0",
            errors: "0",
            skipped: "2",
          })
          expect(
            reportCases(report).map((node) => node.attributes.name),
          ).toEqual(["a", "b", "c"])
        }
      },
    )
  }

it.skipIf(process.platform === "win32")(
  "preserves cancellation exit status when the report cannot be published",
  async () => {
    await save("a", { url: `http://127.0.0.1:${server.port}/hold` })
    collision = join(dir, "cancel.json")
    const running = start(flags("json", collision))
    await entered.promise
    running.child.kill("SIGINT")
    const result = await running.result
    expect(result.code).toBe(130)
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "error",
      errors: ["Collection run cancelled", "Unable to write collection report"],
      data: { cancelled: true },
    })
    expect(await readFile(collision, "utf8")).toBe("another writer")
  },
)
