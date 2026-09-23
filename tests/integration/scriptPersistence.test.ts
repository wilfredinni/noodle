import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectionRun,
  environmentSet,
  persistResponseCaptures,
  persistScriptChanges,
  requestRun,
  secretDelete,
  secretSet,
} from "../../src/app/services"
import { formatRequestRun } from "../../src/app/humanOutput"
import { env } from "../../src/env"
import { lang } from "../../src/lang"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import {
  getStoredSecret,
  setSecretBackendForTests,
  setStoredSecret,
} from "../../src/secrets"
import type { Request } from "../../src/schema"
import { CollectionCookieJar } from "../../src/cookies"
import { buildTimelineEntry } from "../../src/timelineEntry"

let dir: string
let server: ReturnType<typeof Bun.serve>
let vault: Map<string, string>
let seen: Headers[]
let fileAtHttp: string
let rejectValue: string | undefined
let rejectDeletes: boolean
let redirectLocation: string | undefined
const directory = () => join(dir, ".environments")
const file = () => join(directory(), "dev.env")
const request = (scripts: Request["scripts"], id = "first"): Request => ({
  id,
  name: id,
  method: "GET",
  url: `http://127.0.0.1:${server.port}/`,
  timeout: 0,
  headers: {},
  params: [],
  scripts,
})
const save = async (req: Request) =>
  writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
const run = async () =>
  (await requestRun("first", dir, "dev", undefined, true)).result
const send = async (req: Request, scope = new RunScope()) =>
  executeRequestLifecycle({
    request: req,
    runScope: scope,
    environment: await env.loadEnvironment(directory(), "dev"),
    persistScriptChanges: (intents) =>
      persistScriptChanges(intents, "dev", dir),
    persistCaptures: (prepared, raw, execution) =>
      persistResponseCaptures(prepared, raw, execution, "dev", dir),
    transport: { proxyPolicy: { kind: "direct", source: "cli" } },
  })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-script-persistence-"))
  await mkdir(directory())
  await writeFile(
    join(dir, "settings.yml"),
    "collection_id: 123e4567-e89b-42d3-a456-426614174000\nenvironment: dev\ncookies:\n  enabled: false\n",
  )
  await writeFile(
    file(),
    "_color=primary\nKEEP=unchanged\nREMOVE=baseline\n# DISABLED=off\n",
  )
  vault = new Map()
  seen = []
  fileAtHttp = ""
  rejectValue = undefined
  rejectDeletes = false
  redirectLocation = undefined
  setSecretBackendForTests({
    async get({ service, name }) {
      return vault.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value }) {
      if (value === rejectValue) throw new Error(`vault rejected ${value}`)
      vault.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      if (rejectDeletes) throw new Error("vault delete unavailable")
      return vault.delete(`${service}:${name}`)
    },
  })
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      seen.push(req.headers)
      fileAtHttp = await readFile(file(), "utf8")
      const path = new URL(req.url).pathname
      if (path === "/redirect" && redirectLocation)
        return new Response(null, {
          status: 307,
          headers: { location: redirectLocation },
        })
      return Response.json(
        { value: "capture-value", token: "response-secret" },
        {
          status: path === "/http-error" ? 422 : 200,
        },
      )
    },
  })
})
afterEach(async () => {
  server.stop(true)
  setSecretBackendForTests(undefined)
  await rm(dir, { recursive: true, force: true })
})

describe("script persistence", () => {
  it("supports environment CRUD in pre and post while preserving unrelated entries", async () => {
    await save(
      request({
        pre: `
        if (noodle.env.get("KEEP") !== "unchanged") throw Error("read");
        noodle.run.set("VALUE", "pre", { persist: "environment" });
        noodle.run.set("DISABLED", true, { persist: "environment" });
        noodle.run.unset("REMOVE", { persist: "environment" });
      `,
        post: `
        if (noodle.env.get("REMOVE") !== "baseline" || noodle.run.get("VALUE") !== "pre") throw Error("snapshot");
        noodle.run.set("VALUE", { count: 2 }, { persist: "environment" });
        noodle.run.unset("ABSENT", { persist: "environment" });
      `,
      }),
    )
    const result = await run()
    expect(result.ok).toBe(true)
    expect(fileAtHttp).toContain("VALUE=pre")
    expect(fileAtHttp).not.toContain("REMOVE=")
    const saved = await env.loadEnvironment(directory(), "dev")
    expect(saved.vars).toEqual({
      KEEP: "unchanged",
      DISABLED: "true",
      VALUE: '{"count":2}',
    })
    expect(saved.color).toBe("primary")
    expect(
      result.scripts?.results.map((phase) =>
        phase.persistence?.map((outcome) => outcome.status),
      ),
    ).toEqual([
      ["saved", "saved", "saved"],
      ["saved", "saved"],
    ])
  })

  it("creates, updates, reads and fully removes secrets without plaintext storage", async () => {
    await save(
      request({
        pre: 'noodle.run.set("KEEP", "first-secret", { persist: "secret" })',
      }),
    )
    expect((await run()).ok).toBe(true)
    expect(await getStoredSecret(dir, "dev", "KEEP")).toBe("first-secret")
    expect(await readFile(file(), "utf8")).toContain("# @secret KEEP\nKEEP=")
    expect(await readFile(file(), "utf8")).not.toContain("first-secret")
    await save(
      request({
        post: `
      if (noodle.env.get("KEEP") !== "first-secret") throw Error("secret read");
      noodle.run.set("KEEP", noodle.response.json().token, { persist: "secret" });
      console.log(noodle.response.json().token);
    `,
      }),
    )
    const updated = await run()
    expect(updated.ok).toBe(true)
    expect(updated.scripts?.results[0]?.logs[0]?.message).toBe("[REDACTED]")
    expect(await getStoredSecret(dir, "dev", "KEEP")).toBe("response-secret")
    expect(JSON.stringify(updated)).not.toContain("response-secret")
    await save(
      request({
        pre: 'noodle.run.unset("KEEP", { persist: "secret" })',
        post: 'noodle.run.unset("MISSING", { persist: "secret" })',
      }),
    )
    expect((await run()).ok).toBe(true)
    expect(await getStoredSecret(dir, "dev", "KEEP")).toBeNull()
    expect(await readFile(file(), "utf8")).not.toContain("KEEP")
  })

  it("keeps CLI secret delete declarations and preserves disabled secret metadata", async () => {
    await writeFile(file(), "# @secret TOKEN\n# TOKEN=\nKEEP=unchanged\n")
    await setStoredSecret(dir, "dev", "TOKEN", "old")
    await save(
      request({ pre: 'noodle.run.set("TOKEN", "new", { persist: "secret" })' }),
    )
    expect((await run()).ok).toBe(true)
    expect(await readFile(file(), "utf8")).toContain(
      "# @secret TOKEN\n# TOKEN=",
    )
    await secretDelete("TOKEN", "dev", dir)
    expect(await readFile(file(), "utf8")).toContain("# @secret TOKEN")
    await save(
      request({ post: 'noodle.run.unset("TOKEN", { persist: "secret" })' }),
    )
    expect((await run()).ok).toBe(true)
    expect(await readFile(file(), "utf8")).not.toContain("TOKEN")
  })

  it("saves pre, then captured snapshots, then explicit post intents", async () => {
    for (const post of [
      'noodle.run.set("VALUE", "post", { persist: "environment" }); noodle.run.set("VALUE", "transient")',
      'noodle.run.unset("VALUE", { persist: "environment" })',
      'noodle.run.set("VALUE", "transient")',
      'noodle.run.set("VALUE", "failed", { persist: "environment" }); throw Error("post failed")',
    ]) {
      const req = request({
        pre: 'noodle.run.set("VALUE", "pre", { persist: "environment" })',
        post,
      })
      req.captures = {
        VALUE: { value: "body.value", enabled: true, persist: "environment" },
      }
      req.assertions = [
        { expression: "status", operator: "equals", value: 200 },
      ]
      await save(req)
      const result = await run()
      expect(fileAtHttp).toContain("VALUE=pre")
      expect(result.captures?.results[0]).toMatchObject({
        success: true,
        value: "capture-value",
        persisted: "environment",
      })
      expect(result.assertions?.results[0]?.passed).toBe(true)
      const saved = await env.loadEnvironment(directory(), "dev")
      if (post.includes("noodle.run.unset"))
        expect(saved.vars.VALUE).toBeUndefined()
      else
        expect(saved.vars.VALUE).toBe(
          post.includes('"post"') ? "post" : "capture-value",
        )
      expect(result.ok).toBe(!post.includes("throw"))
    }
  })

  it("keeps runners transient and suppresses deleted baseline values until a capture replaces them", async () => {
    await save(
      request({
        pre: 'noodle.run.unset("REMOVE", { persist: "environment" }); noodle.run.set("VALUE", "runner-secret", { persist: "secret" })',
        post: 'if (noodle.run.get("REMOVE") !== undefined) throw Error("unset"); noodle.run.set("VALUE", "public")',
      }),
    )
    await save({
      ...request(
        {
          pre: 'console.log(noodle.env.get("REMOVE")); console.log("runner-secret")',
        },
        "second",
      ),
      captures: { REMOVE: { value: "body.value", enabled: true } },
    })
    await save({
      ...request(undefined, "third"),
      headers: { "X-Remove": { value: "$REMOVE", enabled: true } },
    })
    const before = await readFile(file(), "utf8")
    const result = await collectionRun(dir, "dev", undefined, true)
    expect(result.failed).toBe(false)
    expect(
      result.results[0]?.scripts?.results[0]?.persistence?.every(
        (outcome) => outcome.status === "transient",
      ),
    ).toBe(true)
    expect(result.results[1]?.scripts?.results[0]?.logs[0]?.message).toBe(
      "baseline",
    )
    expect(result.results[1]?.scripts?.results[0]?.logs[1]?.message).toBe(
      "[REDACTED]",
    )
    expect(seen[2]?.get("x-remove")).toBe("capture-value")
    expect(await readFile(file(), "utf8")).toBe(before)
    expect(await getStoredSecret(dir, "dev", "VALUE")).toBeNull()
    expect(formatRequestRun({ result: result.results[0]! })).toContain(
      "transient",
    )
  })

  it("rolls back failed storage batches but retains successful runtime mutations", async () => {
    await writeFile(file(), "KEEP=unchanged\n# @secret TOKEN\nTOKEN=\n")
    await setStoredSecret(dir, "dev", "TOKEN", "old-secret")
    const before = await readFile(file(), "utf8")
    const scope = new RunScope()
    const saveFailure = spyOn(env, "saveEnvironment").mockRejectedValue(
      new Error("disk unavailable"),
    )
    try {
      const result = await send(
        request({
          pre: `
        noodle.run.set("PUBLIC", "runtime", { persist: "environment" });
        noodle.run.set("TOKEN", "new-secret", { persist: "secret" });
      `,
          post: 'console.log(noodle.run.get("PUBLIC")); console.log(noodle.run.get("TOKEN"))',
        }),
        scope,
      )
      expect(result.status).toBe("done")
      expect(result.execution.scripts?.results[0]).toMatchObject({
        success: true,
        persistence: [{ status: "failed" }, { status: "failed" }],
      })
      expect(scope.get("PUBLIC")).toBe("runtime")
      expect(scope.get("TOKEN")).toBe("new-secret")
      expect(result.execution.scripts?.results[1]?.logs[1]?.message).toBe(
        "[REDACTED]",
      )
      expect(await getStoredSecret(dir, "dev", "TOKEN")).toBe("old-secret")
      expect(await readFile(file(), "utf8")).toBe(before)
    } finally {
      saveFailure.mockRestore()
    }
  })

  it("reports vault and rollback failures without exposing secret values", async () => {
    rejectValue = "reject-secret"
    await save(
      request({
        pre: 'noodle.run.set("TOKEN", "reject-secret", { persist: "secret" })',
        post: 'console.log(noodle.run.get("TOKEN"))',
      }),
    )
    const rejected = await run()
    expect(rejected.ok).toBe(false)
    expect(rejected.failureCategories).toEqual(["script"])
    expect(rejected.scripts?.results[0]?.success).toBe(true)
    expect(JSON.stringify(rejected)).not.toContain("reject-secret")
    expect(await readFile(file(), "utf8")).not.toContain("TOKEN")
    rejectValue = undefined
    const saveFailure = spyOn(env, "saveEnvironment").mockRejectedValue(
      new Error("disk unavailable"),
    )
    rejectDeletes = true
    try {
      await save(
        request({
          post: 'noodle.run.set("TOKEN", "new-secret", { persist: "secret" })',
        }),
      )
      const result = await run()
      expect(result.ok).toBe(false)
      expect(
        result.scripts?.results[0]?.persistence?.[0]?.error?.message,
      ).toContain("rollback also failed")
      expect(JSON.stringify(result)).not.toContain("new-secret")
    } finally {
      saveFailure.mockRestore()
    }
  })

  it("rejects wrong storage targets without converting declarations", async () => {
    await writeFile(file(), "KEEP=unchanged\n# @secret TOKEN\nTOKEN=\n")
    await setStoredSecret(dir, "dev", "TOKEN", "old-secret")
    for (const source of [
      'noodle.run.set("TOKEN", "public", { persist: "environment" })',
      'noodle.run.unset("TOKEN", { persist: "environment" })',
      'noodle.run.unset("KEEP", { persist: "secret" })',
    ]) {
      await save(request({ post: source }))
      const result = await run()
      expect(result.ok).toBe(false)
      expect(result.failureCategories).toEqual(["script"])
    }
    expect(await getStoredSecret(dir, "dev", "TOKEN")).toBe("old-secret")
    expect(await readFile(file(), "utf8")).toContain("KEEP=unchanged")
    expect(await readFile(file(), "utf8")).toContain("# @secret TOKEN")
  })

  it("reports missing environments and combines pre persistence errors with transport failures", async () => {
    await save(
      request({
        pre: 'noodle.run.set("VALUE", "runtime", { persist: "environment" })',
      }),
    )
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    const missing = (await requestRun("first", dir, undefined, undefined, true))
      .result
    expect(missing.ok).toBe(false)
    expect(missing.failureCategories).toEqual(["script"])
    expect(missing.scripts?.results[0]?.persistence?.[0]?.error?.message).toBe(
      "no active environment",
    )
    const req = request({
      pre: 'noodle.run.set("VALUE", "runtime", { persist: "environment" })',
    })
    await save(req)
    server.stop(true)
    const saveFailure = spyOn(env, "saveEnvironment").mockRejectedValue(
      new Error("disk unavailable"),
    )
    try {
      const result = await run()
      expect(result.ok).toBe(false)
      expect(result.failureCategories).toEqual(["script", "transport"])
      expect(formatRequestRun({ result })).toContain(
        "execution passed, persistence failed",
      )
    } finally {
      saveFailure.mockRestore()
    }
  })

  it("discards failed VM intents but preserves pre saves across later failures", async () => {
    await save(
      request({
        pre: 'noodle.run.set("VALUE", "discarded", { persist: "environment" }); throw Error("pre failed")',
      }),
    )
    expect((await run()).ok).toBe(false)
    expect(seen).toHaveLength(0)
    expect(await readFile(file(), "utf8")).not.toContain("VALUE")
    await save(
      request({
        pre: 'noodle.run.set("VALUE", "saved", { persist: "environment" })',
        post: 'throw Error("post failed")',
      }),
    )
    expect((await run()).ok).toBe(false)
    expect(await readFile(file(), "utf8")).toContain("VALUE=saved")
  })

  it("coordinates script, capture, environment and secret writes", async () => {
    const results = await Promise.all([
      persistScriptChanges(
        [
          {
            variable: "SCRIPT",
            target: "environment",
            operation: "set",
            value: "script",
          },
        ],
        "dev",
        dir,
      ),
      environmentSet("CLI", "cli", "dev", dir),
      secretSet("TOKEN", "stored-token", "dev", dir),
      persistResponseCaptures(
        {
          captures: {
            CAPTURE: { value: "status", persist: "environment", enabled: true },
          },
        },
        [
          {
            variable: "CAPTURE",
            expression: "status",
            success: true,
            type: "number",
            value: 200,
          },
        ],
        {
          captures: {
            evaluated: true,
            results: [
              {
                variable: "CAPTURE",
                expression: "status",
                success: true,
                type: "number",
                value: 200,
              },
            ],
          },
        },
        "dev",
        dir,
      ),
    ])
    expect(results[0]).toMatchObject({ outcomes: [{ status: "saved" }] })
    const stored = await env.loadEnvironment(directory(), "dev")
    expect(stored.vars).toMatchObject({
      SCRIPT: "script",
      CLI: "cli",
      CAPTURE: "200",
      TOKEN: "stored-token",
      KEEP: "unchanged",
    })
    expect(stored.secretVars?.TOKEN).toBe("keychain")
  })

  it("serializes concurrent batches and preserves changes from each caller", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        persistScriptChanges(
          [
            {
              variable: `KEY${index}`,
              target: "environment",
              operation: "set",
              value: index,
            },
          ],
          "dev",
          dir,
        ),
      ),
    )
    expect(
      results.every((batch) => batch.outcomes[0]?.status === "saved"),
    ).toBe(true)
    const saved = await env.loadEnvironment(directory(), "dev")
    for (let index = 0; index < 8; index++)
      expect(saved.vars[`KEY${index}`]).toBe(String(index))
    expect(saved.vars.KEEP).toBe("unchanged")
  })

  it("preserves writes from concurrent request run processes", async () => {
    const requests = Array.from({ length: 4 }, (_, index) =>
      request(
        {
          pre: Array.from(
            { length: 8 },
            (_, key) =>
              `noodle.run.set("PROCESS_${index}_${key}", "${index}:${key}", { persist: "environment" });`,
          ).join("\n"),
        },
        `process-${index}`,
      ),
    )
    await Promise.all(requests.map(save))
    await Promise.all(
      requests.map(async (req) => {
        const child = Bun.spawn(
          [
            process.execPath,
            join(import.meta.dir, "../../src/app/cli.ts"),
            "request",
            "run",
            req.id,
            "--collection",
            dir,
            "--env",
            "dev",
            "--noproxy",
            "--json",
          ],
          { stdout: "pipe", stderr: "pipe" },
        )
        const [stdout, stderr, exit] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        expect({ exit, stderr, result: JSON.parse(stdout).status }).toEqual({
          exit: 0,
          stderr: "",
          result: "success",
        })
      }),
    )
    const stored = await env.loadEnvironment(directory(), "dev")
    expect(stored.vars.KEEP).toBe("unchanged")
    for (let index = 0; index < requests.length; index++)
      for (let key = 0; key < 8; key++)
        expect(stored.vars[`PROCESS_${index}_${key}`]).toBe(`${index}:${key}`)
  })

  it("retains post cookie and scope commits and runs assertions after storage failure", async () => {
    const jar = await CollectionCookieJar.open(dir, "script-post-test")
    const scope = new RunScope()
    const saveFailure = spyOn(env, "saveEnvironment").mockRejectedValue(
      new Error("disk unavailable"),
    )
    try {
      const req = request({
        post: `
        noodle.cookies.set({ name: "session", value: "cookie-secret" });
        noodle.run.set("TOKEN", "post-secret", { persist: "secret" });
      `,
      })
      req.assertions = [
        { expression: "status", operator: "equals", value: 201 },
      ]
      const result = await executeRequestLifecycle({
        request: req,
        runScope: scope,
        environment: await env.loadEnvironment(directory(), "dev"),
        persistScriptChanges: (intents) =>
          persistScriptChanges(intents, "dev", dir),
        transport: {
          cookies: jar,
          proxyPolicy: { kind: "direct", source: "cli" },
        },
      })
      expect(result.status).toBe("done")
      expect(result.execution.scripts?.results[0]).toMatchObject({
        success: true,
        persistence: [{ status: "failed" }],
      })
      expect(result.execution.assertions?.results[0]?.passed).toBe(false)
      expect(scope.get("TOKEN")).toBe("post-secret")
      expect(
        jar.list().find((cookie) => cookie.name === "session")?.value,
      ).toBe("cookie-secret")
      expect(await getStoredSecret(dir, "dev", "TOKEN")).toBeNull()
    } finally {
      saveFailure.mockRestore()
      await jar.close()
    }
  })

  it("collects script, HTTP, capture and assertion failures together", async () => {
    const req = request({
      post: 'noodle.run.set("VALUE", "runtime", { persist: "environment" })',
    })
    req.url += "http-error"
    req.captures = { missing: { value: "body.absent", enabled: true } }
    req.assertions = [{ expression: "status", operator: "equals", value: 200 }]
    await save(req)
    const saveFailure = spyOn(env, "saveEnvironment").mockRejectedValue(
      new Error("disk unavailable"),
    )
    try {
      const result = await run()
      expect(result.failureCategories).toEqual([
        "script",
        "http",
        "capture",
        "assertion",
      ])
      expect(result.scripts?.results[0]?.success).toBe(true)
    } finally {
      saveFailure.mockRestore()
    }
  })

  it("retains removed secrets for later redaction, timelines and cross-origin redirect protection", async () => {
    const scope = new RunScope()
    const first = await send(
      request({
        pre: 'noodle.run.set("TOKEN", "response-secret", { persist: "secret" })',
        post: 'noodle.run.unset("TOKEN", { persist: "secret" }); console.log("response-secret")',
      }),
      scope,
    )
    expect(first.status).toBe("done")
    if (first.status !== "done") throw first.error
    expect(first.execution.scripts?.results[1]?.logs[0]?.message).toBe(
      "[REDACTED]",
    )
    expect(await readFile(file(), "utf8")).not.toContain("TOKEN")
    const timeline = buildTimelineEntry(
      first.request,
      { status: "done", response: first.response, execution: first.execution },
      "dev",
      undefined,
      first.secretValues,
      true,
    )
    expect(JSON.stringify(timeline)).not.toContain("response-secret")
    expect(timeline.scripts).toEqual({
      ...first.execution.scripts!,
      results: first.execution.scripts!.results.map((result) => ({
        ...result,
        logs: [],
      })),
    })
    expect(timeline.request).not.toHaveProperty("scripts")
    const foreignHeaders: Headers[] = []
    const foreign = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        foreignHeaders.push(req.headers)
        return new Response("ok")
      },
    })
    redirectLocation = `http://127.0.0.1:${foreign.port}/`
    try {
      const get = {
        ...request(undefined),
        url: `http://127.0.0.1:${server.port}/redirect`,
        headers: { "X-Custom": { value: "response-secret", enabled: true } },
      }
      expect((await send(get, scope)).status).toBe("done")
      expect(foreignHeaders[0]?.get("x-custom")).toBeNull()
      const body = await send(
        {
          ...get,
          method: "POST",
          bodyType: "json",
          body: '{"token":"response-secret"}',
        },
        scope,
      )
      expect(body.status).toBe("error")
      expect(foreignHeaders).toHaveLength(1)
    } finally {
      foreign.stop(true)
    }
  })
})
