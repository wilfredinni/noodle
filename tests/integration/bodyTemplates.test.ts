import { afterEach, beforeEach, expect, it } from "bun:test"
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
const request = (overrides: Partial<Request> = {}): Request => ({
  id: "random",
  name: "Random",
  method: "POST",
  url: `http://127.0.0.1:${server.port}/echo`,
  headers: {},
  params: [],
  timeout: 0,
  bodyType: "json",
  body: '{"id":"$random.uuid"}',
  ...overrides,
})
const transport = {
  proxyPolicy: { kind: "direct" as const, source: "cli" as const },
}
beforeEach(async () => {
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
  server?.stop(true)
  await rm(dir, { recursive: true, force: true })
})

it("resolves before pre-scripts, reuses the body on redirects and redacts generated passwords in history and diagnostics", async () => {
  const scope = new RunScope()
  const root = request({
    url: `http://127.0.0.1:${server.port}/redirect`,
    followRedirects: true,
    body: '{"id":"$random.uuid","password":"$random.password"}',
    scripts: {
      pre: 'const body = noodle.request.body.json(); if (body.id.startsWith("$")) throw Error("unresolved"); console.log(body.password); noodle.run.set("id", body.id);',
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

it("stops invalid templates before pre-scripts and HTTP while retaining any generated secrets", async () => {
  const scope = new RunScope()
  const result = await executeRequestLifecycle({
    request: request({
      body: '{"password":"$random.password","id":"$random.uuid(1)"}',
      scripts: { pre: 'noodle.run.set("ran", true);' },
    }),
    runScope: scope,
    transport,
  })
  expect(result.status).toBe("error")
  if (result.status !== "error") throw Error("expected template failure")
  expect(result.failureCategory).toBe("execution")
  expect(result.error.message).toContain("does not accept arguments")
  expect(new Set(result.secretValues).size).toBe(1)
  expect(scope.secretValues()).toHaveLength(1)
  expect(scope.get("ran")).toBeUndefined()
  expect(seen).toHaveLength(0)
})

it("evaluates saved child templates and leaves direct script requests and pre-script writes literal", async () => {
  const child = request({ id: "child" })
  const root = request({
    id: "root",
    body: "{}",
    scripts: {
      pre: `
    await noodle.runRequest("child");
    await noodle.sendRequest({url:${JSON.stringify(child.url)},method:"POST",body:"$random.uuid"});
    noodle.request.body.setText("$random.uuid");
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
  expect(seen[1]!.body).toBe("$random.uuid")
  expect(seen[2]!.body).toBe("$random.uuid")
})

it("uses the same generation in request runs and every collection data iteration without rewriting YAML", async () => {
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
  expect(await Bun.file(join(dir, "random.yml")).text()).toContain(
    "$random.uuid",
  )
})

it("registers passwords in the lower-level send entry point and preserves literal mode", async () => {
  const secrets: string[] = []
  await send(request({ body: '{"password":"$random.password"}' }), {
    ...transport,
    onSensitiveValues: (values) => secrets.push(...values),
  })
  expect(secrets).toContain(JSON.parse(seen[0]!.body).password)
  await send(request(), { ...transport, resolveVariables: false })
  expect(seen[1]!.body).toContain("$random.uuid")
})
