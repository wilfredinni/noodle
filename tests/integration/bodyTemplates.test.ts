import { afterEach, beforeEach, expect, it, setSystemTime } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import { send } from "../../src/requests/send"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { collectionRun, requestRun } from "../../src/app/services"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"

let server: ReturnType<typeof Bun.serve>
let dir: string
let seen: { path: string; body: string }[]
let afterReceive: (() => void) | undefined
const timestamp = Date.parse("2026-01-01T00:00:00.123Z")
const request = (overrides: Partial<Request> = {}): Request => ({
  id: "random",
  name: "Random",
  method: "POST",
  url: `http://127.0.0.1:${server.port}/echo`,
  headers: {},
  params: [],
  timeout: 0,
  bodyType: "json",
  body: '{"id":"$random.uuid","ms":$time.now,"seconds":$time.unix,"iso":$time.iso}',
  ...overrides,
})
const transport = {
  proxyPolicy: { kind: "direct" as const, source: "cli" as const },
}
beforeEach(async () => {
  setSystemTime(timestamp)
  afterReceive = undefined
  seen = []
  dir = await mkdtemp(join(tmpdir(), "noodle-body-template-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      const body = await req.text()
      seen.push({ path, body })
      afterReceive?.()
      if (path === "/redirect")
        return new Response(null, {
          status: 307,
          headers: { location: "/echo" },
        })
      return Response.json({ body })
    },
  })
})
afterEach(async () => {
  setSystemTime()
  server?.stop(true)
  await rm(dir, { recursive: true, force: true })
})

it("resolves before pre-scripts, reuses the body on redirects and redacts generated passwords in history and diagnostics", async () => {
  afterReceive = () => setSystemTime(timestamp + 1000)
  const scope = new RunScope()
  const root = request({
    url: `http://127.0.0.1:${server.port}/redirect`,
    followRedirects: true,
    body: '{"id":"$random.uuid","password":"$random.password","time":$time.iso}',
    scripts: {
      pre: 'const body = noodle.request.body.json(); if (body.id.startsWith("$") || body.time !== "2026-01-01T00:00:00.123Z") throw Error("unresolved"); console.log(body.password); noodle.run.set("id", body.id);',
      post: "console.log(noodle.request.body.json().password);",
    },
  })
  const result = await executeRequestLifecycle({
    request: root,
    runScope: scope,
    transport,
  })
  expect(result.status).toBe("done")
  expect(seen).toHaveLength(2)
  expect(seen[0]!.body).toBe(seen[1]!.body)
  const body = JSON.parse(seen[0]!.body)
  expect(scope.get("id")).toBe(body.id)
  expect(result.secretValues).toContain(body.password)
  expect(JSON.stringify(result.execution)).not.toContain(body.password)
  const history = buildTimelineEntry(
    result.request,
    result,
    undefined,
    undefined,
    result.secretValues,
    true,
  )
  expect(JSON.stringify(history)).not.toContain(body.password)
  expect(JSON.stringify(history)).toContain(body.id)
})

it.each(["$random.uuid(1)", "$time.now(1)"])(
  "stops invalid %s before pre-scripts and HTTP while retaining any generated secrets",
  async (invalid) => {
    const scope = new RunScope()
    const result = await executeRequestLifecycle({
      request: request({
        body: `{"password":"$random.password","id":"${invalid}"}`,
        scripts: { pre: 'noodle.run.set("ran", true);' },
      }),
      runScope: scope,
      transport,
    })
    expect(result.status).toBe("error")
    if (result.status !== "error") throw Error("expected template failure")
    expect(result.failureCategory).toBe("execution")
    expect(result.error.message).toContain("arguments")
    expect(new Set(result.secretValues).size).toBe(1)
    expect(scope.secretValues()).toHaveLength(1)
    expect(scope.get("ran")).toBeUndefined()
    expect(seen).toHaveLength(0)
  },
)

it("evaluates saved child templates and leaves direct script requests and pre-script writes literal", async () => {
  const child = request({ id: "child" })
  const root = request({
    id: "root",
    body: "{}",
    scripts: {
      pre: `
    await noodle.runRequest("child");
    await noodle.sendRequest({url:${JSON.stringify(child.url)},method:"POST",body:"$random.uuid $time.now"});
    noodle.request.body.setText("$random.uuid $time.now");
  `,
    },
  })
  const result = await executeRequestLifecycle({
    request: root,
    requestPath: "root",
    collection: {
      id: "test",
      name: "Test",
      items: [root, child].map((data) => ({ type: "request" as const, data })),
    },
    runScope: new RunScope(),
    transport,
  })
  expect(result.status).toBe("done")
  expect(seen).toHaveLength(3)
  expect(JSON.parse(seen[0]!.body).id).toMatch(/^[\da-f-]{36}$/)
  expect(JSON.parse(seen[0]!.body).ms).toBe(timestamp)
  expect(seen[1]!.body).toBe("$random.uuid $time.now")
  expect(seen[2]!.body).toBe("$random.uuid $time.now")
})

it("uses the same generation in request runs and every collection data iteration without rewriting YAML", async () => {
  afterReceive = () => setSystemTime(timestamp + seen.length * 1000)
  const root = request()
  await writeFile(join(dir, "random.yml"), lang.serializeRequest(root))
  const single = await requestRun("random", dir, undefined, undefined, true)
  expect(single.failed).toBe(false)
  await writeFile(join(dir, "data.json"), '[{"row":1},{"row":2}]')
  const run = await collectionRun(
    dir,
    undefined,
    undefined,
    true,
    undefined,
    false,
    [],
    [],
    [],
    false,
    undefined,
    0,
    join(dir, "data.json"),
  )
  expect(run.failed).toBe(false)
  expect(seen).toHaveLength(3)
  expect(new Set(seen.map((entry) => JSON.parse(entry.body).id)).size).toBe(3)
  for (const [index, entry] of seen.entries()) {
    const expected = timestamp + index * 1000
    expect(JSON.parse(entry.body)).toMatchObject({
      ms: expected,
      seconds: Math.floor(expected / 1000),
      iso: new Date(expected).toISOString(),
    })
  }
  expect(await Bun.file(join(dir, "random.yml")).text()).toContain(
    "$random.uuid",
  )
  expect(await Bun.file(join(dir, "random.yml")).text()).toContain("$time.now")
})

it("registers passwords in the lower-level send entry point and preserves literal mode", async () => {
  const secrets: string[] = []
  await send(
    request({ body: '{"password":"$random.password","now":$time.now}' }),
    {
      ...transport,
      onSensitiveValues: (values) => secrets.push(...values),
    },
  )
  expect(secrets).toContain(JSON.parse(seen[0]!.body).password)
  expect(JSON.parse(seen[0]!.body).now).toBe(timestamp)
  await send(request(), { ...transport, resolveVariables: false })
  expect(seen[1]!.body).toContain("$random.uuid")
  expect(seen[1]!.body).toContain("$time.now")
})
