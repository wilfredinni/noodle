import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectionAudit,
  collectionFormat,
  collectionInspect,
  collectionInit,
  collectionList,
  collectionRun,
  cookieClear,
  cookieList,
  environmentSet,
  requestCreate,
  requestRun,
  selectCollectionRunRequests,
  validateId,
  workspaceAudit,
} from "../../src/app/services"
import { filestore } from "../../src/filestore"
import { collection as collectionCommand } from "../../src/app/commands/automation"
import { env } from "../../src/env"
import { executor } from "../../src/requests"
import { setSecretBackendForTests, type SecretBackend } from "../../src/secrets"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-automation-"))
})
afterEach(async () => {
  setSecretBackendForTests(undefined)
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

  it("discovers collection contents without parsing invalid settings", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "tls:\n  client_certifcates: []\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    expect((await collectionList(dir)).tree).toEqual([
      {
        type: "request",
        id: "request",
        name: "Request",
        method: "GET",
        url: "https://example.com",
      },
    ])
  })

  it("rejects non-collection roots for all collection operations", async () => {
    await expect(collectionInspect(dir)).rejects.toThrow(
      "not a collection root",
    )
    await expect(collectionAudit(dir, false)).rejects.toThrow(
      "not a collection root",
    )
    await expect(collectionFormat(dir)).rejects.toThrow("not a collection root")
    expect(await collectionRun(dir)).toMatchObject({
      failed: true,
      failure: {
        category: "configuration",
        message: expect.stringContaining("not a collection root"),
      },
      summary: { failureCategories: ["configuration"] },
    })
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

  it("initializes an existing non-collection directory", async () => {
    const configDir = join(dir, "config")
    const result = await collectionInit(dir, configDir)
    expect(result.path).toBe(dir)
    expect(await readFile(join(dir, "settings.yml"), "utf8")).toContain(
      "environment: development",
    )
    expect(await env.listEnvironments(join(dir, ".environments"))).toEqual([
      "development",
    ])
    expect(await readFile(join(configDir, "config.yml"), "utf8")).toContain(dir)
  })

  it("rejects initializing an existing collection", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n", "utf8")
    await expect(collectionInit(dir)).rejects.toThrow("already a collection")
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

  it("accepts scheme-less request URLs without rewriting them", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n", "utf8")
    await requestCreate("bare-url", "www.example.com", "GET", dir)

    const result = await collectionInspect(dir)
    expect(result.tree).toContainEqual({
      type: "request",
      id: "bare-url",
      name: "bare-url",
      method: "GET",
      url: "www.example.com",
    })
  })

  it("accepts scheme-less host-and-port URLs without rewriting them", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n", "utf8")
    await requestCreate("bare-port", "localhost:3000/health", "GET", dir)
    await requestCreate("loopback", "127.0.0.1:8080/health", "GET", dir)
    await requestCreate(
      "remote-port",
      "api.example.com:8443/health",
      "GET",
      dir,
    )
    await requestCreate("service-port", "api:3000/health", "GET", dir)
    await requestCreate("ftp-port", "ftp:21", "GET", dir)

    const result = await collectionInspect(dir)
    expect(result.tree).toContainEqual({
      type: "request",
      id: "bare-port",
      name: "bare-port",
      method: "GET",
      url: "localhost:3000/health",
    })
    expect(result.tree).toContainEqual({
      type: "request",
      id: "loopback",
      name: "loopback",
      method: "GET",
      url: "127.0.0.1:8080/health",
    })
    expect(result.tree).toContainEqual({
      type: "request",
      id: "remote-port",
      name: "remote-port",
      method: "GET",
      url: "api.example.com:8443/health",
    })
    expect(result.tree).toContainEqual({
      type: "request",
      id: "service-port",
      name: "service-port",
      method: "GET",
      url: "api:3000/health",
    })
    expect(result.tree).toContainEqual({
      type: "request",
      id: "ftp-port",
      name: "ftp-port",
      method: "GET",
      url: "ftp:21",
    })
  })

  it("rejects non-HTTP request URL schemes", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n", "utf8")
    await expect(
      requestCreate("ftp-url", "ftp://example.com/file", "GET", dir),
    ).rejects.toThrow('unsupported URL scheme "ftp:"')
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

  it("formats valid JSON request bodies without changing invalid JSON", async () => {
    await writeFile(
      join(dir, "json.yml"),
      'name: JSON\nmethod: POST\nurl: https://example.com\ntags: [smoke, users]\nbody: \'{"name":"Noodle","id":9007199254740993}\'\nbody_type: json\n',
      "utf8",
    )
    await writeFile(
      join(dir, "invalid.yml"),
      "name: Invalid\nmethod: POST\nurl: https://example.com\nbody: '{not json}'\nbody_type: json\n",
      "utf8",
    )

    const result = await collectionFormat(dir)

    expect(result).toEqual({
      path: dir,
      requestCount: 2,
      formattedJsonBodies: 1,
    })
    expect(await readFile(join(dir, "json.yml"), "utf8")).toContain(
      'body: |-\n  {\n    "name": "Noodle",\n    "id": 9007199254740993\n  }',
    )
    expect(await readFile(join(dir, "json.yml"), "utf8")).toContain(
      "tags:\n  - smoke\n  - users\n",
    )
    expect(await readFile(join(dir, "invalid.yml"), "utf8")).toContain(
      "body: '{not json}'",
    )
  })

  it("uses the collection default environment when running requests", async () => {
    await writeFile(join(dir, "settings.yml"), "environment: development\n")
    await env.saveEnvironment(join(dir, ".environments"), {
      name: "development",
      vars: { BASE_URL: "https://example.com" },
    })
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: $BASE_URL\n",
    )
    const send = executor.send
    executor.send = async (_request, options) => {
      expect(options?.environment?.name).toBe("development")
      expect(options?.environment?.vars.BASE_URL).toBe("https://example.com")
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 1,
      }
    }
    try {
      const result = await collectionRun(dir)
      expect(result.failed).toBe(false)
      expect(result.results[0]).toMatchObject({
        url: "https://example.com",
        ok: true,
      })
    } finally {
      executor.send = send
    }
  })

  it("runs mixed request and folder targets once in collection order", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await mkdir(join(dir, "alpha", "nested"), { recursive: true })
    await mkdir(join(dir, "beta"))
    for (const id of [
      "alpha/first",
      "alpha/nested/second",
      "beta/third",
      "health",
      "root",
      "skip",
    ]) {
      await writeFile(
        join(dir, `${id}.yml`),
        `name: ${id}\nmethod: GET\nurl: https://example.com/${id}\n`,
      )
    }

    const sent: string[] = []
    const progress: Array<[number, number]> = []
    const send = executor.send
    executor.send = async (request) => {
      sent.push(request.id)
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 1,
      }
    }
    try {
      const result = await collectionRun(
        dir,
        undefined,
        (completed, total) => progress.push([completed, total]),
        false,
        undefined,
        false,
        ["root", "health", "alpha/", "alpha/nested/second", "beta/"],
      )
      expect(result.results.map((item) => item.id)).toEqual([
        "alpha/nested/second",
        "alpha/first",
        "beta/third",
        "health",
        "root",
      ])
      expect(sent).toEqual(result.results.map((item) => item.id))
      expect(progress).toEqual([
        [0, 5],
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
        [5, 5],
      ])
    } finally {
      executor.send = send
    }
  })

  it("filters targets by inherited request and folder tags", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(join(dir, "folder.yml"), "tags: [destructive]\n")
    await mkdir(join(dir, "admin"))
    await mkdir(join(dir, "users"))
    await writeFile(
      join(dir, "admin", "folder.yml"),
      "tags: [smoke, destructive]\n",
    )
    await writeFile(join(dir, "users", "folder.yml"), "tags: [smoke, users]\n")
    for (const [id, tags] of [
      ["admin/drop", ""],
      ["users/list", "tags: [users]\n"],
      ["users/remove", "tags: [destructive]\n"],
      ["root", "tags: [smoke]\n"],
      ["untagged", ""],
    ]) {
      await writeFile(
        join(dir, `${id}.yml`),
        `name: ${id}\nmethod: GET\nurl: https://example.com/${id}\n${tags}`,
      )
    }

    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: "",
      timeMs: 1,
    })
    try {
      const include = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        [],
        "smoke",
      )
      expect(include.results.map((result) => result.id)).toEqual([
        "admin/drop",
        "users/list",
        "users/remove",
        "root",
      ])
      expect(include.summary.selected).toBe(4)

      const exclude = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        [],
        undefined,
        "destructive",
      )
      expect(exclude.results.map((result) => result.id)).toEqual([
        "users/list",
        "root",
        "untagged",
      ])

      const combined = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        [],
        "smoke",
        "destructive",
      )
      expect(combined.results.map((result) => result.id)).toEqual([
        "users/list",
        "root",
      ])
      expect(combined.skipped).toEqual([])

      const targeted = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        ["users/"],
        "smoke",
        "destructive",
      )
      expect(targeted.results.map((result) => result.id)).toEqual([
        "users/list",
      ])
      const loaded = await filestore.loadCollection(dir)
      expect(
        selectCollectionRunRequests(
          loaded.items,
          ["users/"],
          "smoke",
          "destructive",
        ).map((request) => request.id),
      ).toEqual(targeted.results.map((result) => result.id))
    } finally {
      executor.send = send
    }
  })

  it("returns a configuration failure when tag filters match nothing", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "tls:\n  client_certifcates: []\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\ntags: [smoke]\n",
    )
    const send = executor.send
    let sends = 0
    executor.send = async () => {
      sends++
      throw new Error("should not send")
    }
    try {
      expect(
        await collectionRun(
          dir,
          undefined,
          undefined,
          false,
          undefined,
          false,
          ["missing"],
          "Smoke",
        ),
      ).toMatchObject({
        failure: { message: 'collection target not found: "missing"' },
      })
      const result = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        [],
        "Smoke",
      )
      expect(result).toMatchObject({
        failed: true,
        results: [],
        skipped: [],
        failure: {
          category: "configuration",
          message: "no requests match the tag filters",
        },
        summary: {
          selected: 0,
          executed: 0,
          failureCategories: ["configuration"],
        },
      })
      expect(Number.isInteger(result.summary.durationMs)).toBe(true)
      expect(sends).toBe(0)
    } finally {
      executor.send = send
    }
  })

  it("propagates captures only through requests selected by tag filters", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "01-source.yml"),
      "name: Source\nmethod: GET\nurl: https://example.com/source\ntags: [smoke]\ncapture:\n  user_id: body.id\n",
    )
    await writeFile(
      join(dir, "02-filtered.yml"),
      "name: Filtered\nmethod: GET\nurl: https://example.com/filtered\ntags: [users]\ncapture:\n  user_id: body.id\n",
    )
    await writeFile(
      join(dir, "03-use.yml"),
      "name: Use\nmethod: GET\nurl: https://example.com/users/$user_id\ntags: [smoke]\n",
    )
    const sent: string[] = []
    const send = executor.send
    executor.send = async (request) => {
      sent.push(request.id)
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        body: request.id === "01-source" ? '{"id":1}' : '{"id":2}',
        timeMs: 1,
      }
    }
    try {
      const result = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        [],
        "smoke",
      )
      expect(sent).toEqual(["01-source", "03-use"])
      expect(result.results.map((item) => item.url)).toEqual([
        "https://example.com/source",
        "https://example.com/users/1",
      ])
      expect(result.summary).toMatchObject({
        selected: 2,
        executed: 2,
        skipped: 0,
        requestSuccesses: 2,
        requestFailures: 0,
      })
    } finally {
      executor.send = send
    }
  })

  it("aggregates typed failure categories in taxonomy order", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "01-response.yml"),
      "name: Response failures\nmethod: GET\nurl: https://example.com/response\ncapture:\n  id: body.missing\nassert:\n  - expression: status\n    operator: equals\n    value: 200\n",
    )
    await writeFile(
      join(dir, "02-execution.yml"),
      "name: Execution failure\nmethod: GET\nurl: https://example.com/$MISSING\n",
    )
    await writeFile(
      join(dir, "03-transport.yml"),
      "name: Transport failure\nmethod: GET\nurl: https://example.com/transport\n",
    )
    await writeFile(
      join(dir, "04-success.yml"),
      "name: Success\nmethod: GET\nurl: https://example.com/success\n",
    )
    const send = executor.send
    executor.send = async (request) => {
      if (request.id === "03-transport") {
        const error = new Error("network unavailable") as Error & {
          network: { timeMs: number; type: "error"; message: string }[]
        }
        error.network = [
          { timeMs: 1, type: "error", message: "network unavailable" },
        ]
        throw error
      }
      return {
        status: request.id === "01-response" ? 500 : 200,
        statusText: request.id === "01-response" ? "Error" : "OK",
        headers: {},
        body: "{}",
        timeMs: 1,
      }
    }
    try {
      const result = await collectionRun(dir)
      expect(result.results.map((item) => item.failureCategories)).toEqual([
        ["http", "capture", "assertion"],
        ["execution"],
        ["transport"],
        [],
      ])
      expect(result.summary).toMatchObject({
        selected: 4,
        executed: 4,
        requestSuccesses: 1,
        requestFailures: 3,
        assertionPasses: 0,
        assertionFailures: 1,
        captureFailures: 1,
        failureCategories: [
          "execution",
          "transport",
          "http",
          "capture",
          "assertion",
        ],
      })
    } finally {
      executor.send = send
    }
  })

  it("stops on the first failure and records ordered fail-fast skips", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    for (const id of ["01-fail", "02-skip", "03-skip"]) {
      await writeFile(
        join(dir, `${id}.yml`),
        `name: ${id}\nmethod: GET\nurl: https://example.com/${id}\n`,
      )
    }
    const sent: string[] = []
    const send = executor.send
    executor.send = async (request) => {
      sent.push(request.id)
      return {
        status: request.id === "01-fail" ? 500 : 200,
        statusText: request.id === "01-fail" ? "Error" : "OK",
        headers: {},
        body: "",
        timeMs: 1,
      }
    }
    try {
      const result = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        [],
        undefined,
        undefined,
        true,
      )
      expect(sent).toEqual(["01-fail"])
      expect(result.results.map((item) => item.id)).toEqual(["01-fail"])
      expect(result.skipped).toEqual([
        { id: "02-skip", reason: "fail-fast" },
        { id: "03-skip", reason: "fail-fast" },
      ])
      expect(result.summary).toMatchObject({
        selected: 3,
        executed: 1,
        skipped: 2,
        requestSuccesses: 0,
        requestFailures: 1,
        failureCategories: ["http"],
      })
    } finally {
      executor.send = send
    }
  })

  it("rejects unknown targets before sending any request", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    let sends = 0
    const send = executor.send
    executor.send = async () => {
      sends += 1
      throw new Error("should not send")
    }
    try {
      await mkdir(join(dir, "folder"))
      expect(
        await collectionRun(
          dir,
          undefined,
          undefined,
          false,
          undefined,
          false,
          ["folder"],
        ),
      ).toMatchObject({
        failed: true,
        failure: {
          category: "configuration",
          message: 'folder target must end in "/": "folder/"',
        },
      })
      expect(
        await collectionRun(
          dir,
          undefined,
          undefined,
          false,
          undefined,
          false,
          ["request", "missing/"],
        ),
      ).toMatchObject({
        failed: true,
        failure: {
          category: "configuration",
          message: 'collection target not found: "missing/"',
        },
      })
      expect(sends).toBe(0)
    } finally {
      executor.send = send
    }
  })

  it("accepts an empty folder target", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await mkdir(join(dir, "empty"))
    expect(
      await collectionRun(dir, undefined, undefined, false, undefined, false, [
        "empty/",
      ]),
    ).toMatchObject({
      results: [],
      skipped: [],
      failed: false,
      summary: {
        selected: 0,
        executed: 0,
        skipped: 0,
        failureCategories: [],
      },
    })
  })

  it("keeps server response fields intact in automation output", async () => {
    const key = "NOODLE_AUTOMATION_RESPONSE_SECRET"
    const originalValue = process.env[key]
    const send = executor.send
    try {
      process.env[key] = "response-secret"
      await writeFile(join(dir, "settings.yml"), "environment: development\n")
      await env.saveEnvironment(join(dir, ".environments"), {
        name: "development",
        vars: {},
        secretVars: { [key]: "process" },
      })
      await writeFile(
        join(dir, "request.yml"),
        "name: Request\nmethod: GET\nurl: https://example.com\n",
      )
      executor.send = async () => ({
        status: 200,
        statusText: "response-secret",
        headers: { "x-echo": "response-secret" },
        body: "echo:response-secret",
        timeMs: 1,
      })
      const result = await collectionRun(dir)
      expect(result.results[0]!.response).toMatchObject({
        statusText: "response-secret",
        headers: { "x-echo": "response-secret" },
        body: "echo:response-secret",
      })
    } finally {
      executor.send = send
      if (originalValue === undefined) delete process.env[key]
      else process.env[key] = originalValue
    }
  })

  it("captures typed response values for request run", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\ncapture:\n  user_id: body.user.id\n  request_id: headers.x-request-id\n  explicit_null: body.nothing\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: { "X-Request-ID": "req-1" },
      body: '{"user":{"id":42},"nothing":null}',
      timeMs: 1,
    })
    try {
      const result = await requestRun("request", dir)
      expect(result).toMatchObject({
        failed: false,
        result: {
          ok: true,
          captures: {
            evaluated: true,
            results: [
              { variable: "user_id", success: true, type: "number", value: 42 },
              {
                variable: "request_id",
                success: true,
                type: "string",
                value: "req-1",
              },
              {
                variable: "explicit_null",
                success: true,
                type: "null",
                value: null,
              },
            ],
          },
        },
      })
    } finally {
      executor.send = send
    }
  })

  it("rejects invalid capture expressions before sending", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\ncapture:\n  user_id: body..id\n",
    )
    const send = executor.send
    let sends = 0
    executor.send = async () => {
      sends++
      throw new Error("should not send")
    }
    try {
      expect(await collectionRun(dir)).toMatchObject({
        failed: true,
        failure: {
          category: "configuration",
          message: expect.stringContaining(
            'capture.user_id: Invalid response expression "body..id"',
          ),
        },
      })
      expect(sends).toBe(0)
    } finally {
      executor.send = send
    }
  })

  it("reports captures as unevaluated after a network failure", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\ncapture:\n  user_id: body.id\n",
    )
    const send = executor.send
    executor.send = async () => {
      throw new Error("network unavailable")
    }
    try {
      expect((await requestRun("request", dir)).result).toMatchObject({
        ok: false,
        error: "network unavailable",
        captures: { evaluated: false, results: [] },
      })
    } finally {
      executor.send = send
    }
  })

  it("chains captures through later requests in collection order", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "environment: development\ncookies:\n  enabled: false\n",
    )
    const settingsBefore = await readFile(join(dir, "settings.yml"), "utf8")
    await env.saveEnvironment(join(dir, ".environments"), {
      name: "development",
      vars: { BASE_URL: "https://example.com", user_id: "environment" },
    })
    const environmentFile = join(dir, ".environments", "development.env")
    const before = await readFile(environmentFile, "utf8")
    await writeFile(
      join(dir, "01-source.yml"),
      "name: 1 Source\nmethod: GET\nurl: $BASE_URL/source\ncapture:\n  user_id: body.user.id\n",
    )
    await writeFile(
      join(dir, "02-middle.yml"),
      "name: 2 Middle\nmethod: GET\nurl: $BASE_URL/users/$user_id\ncapture:\n  next_id: headers.x-next-id\n",
    )
    await writeFile(
      join(dir, "03-last.yml"),
      "name: 3 Last\nmethod: GET\nurl: $BASE_URL/users/$next_id\n",
    )
    const environments: Array<Record<string, string>> = []
    const send = executor.send
    executor.send = async (request, options) => {
      environments.push({ ...(options?.environment?.vars ?? {}) })
      const headers: Record<string, string> =
        request.id === "01-source" ? {} : { "x-next-id": "84" }
      return {
        status: 200,
        statusText: "OK",
        headers,
        body: request.id === "01-source" ? '{"user":{"id":42}}' : "{}",
        timeMs: 1,
      }
    }
    try {
      const result = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        ["03-last", "02-middle", "01-source"],
      )
      expect(result.failed).toBe(false)
      expect(result.results.map((item) => item.url)).toEqual([
        "https://example.com/source",
        "https://example.com/users/42",
        "https://example.com/users/84",
      ])
      expect(environments[0]?.user_id).toBe("environment")
      expect(environments[1]?.user_id).toBe("42")
      expect(environments[2]?.next_id).toBe("84")
      expect(await readFile(environmentFile, "utf8")).toBe(before)
      expect(await readFile(join(dir, "settings.yml"), "utf8")).toBe(
        settingsBefore,
      )
      expect(existsSync(join(dir, ".timeline"))).toBe(false)
    } finally {
      executor.send = send
    }
  })

  it("keeps successful captures when another capture fails and continues", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "01-seed.yml"),
      "name: 1 Seed\nmethod: GET\nurl: https://example.com/seed\ncapture:\n  id: body.id\n",
    )
    await writeFile(
      join(dir, "02-recapture.yml"),
      "name: 2 Recapture\nmethod: GET\nurl: https://example.com/recapture\ncapture:\n  id: body.missing\n  next_id: body.next\n",
    )
    await writeFile(
      join(dir, "03-use.yml"),
      "name: 3 Use\nmethod: GET\nurl: https://example.com/$id/$next_id\n",
    )
    const send = executor.send
    executor.send = async (request) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: request.id === "01-seed" ? '{"id":7}' : '{"next":8}',
      timeMs: 1,
    })
    try {
      const result = await collectionRun(dir)
      expect(result.failed).toBe(true)
      expect(result.results[1]).toMatchObject({
        ok: false,
        captures: {
          evaluated: true,
          results: [
            { variable: "id", success: false, failureReason: "missing" },
            { variable: "next_id", success: true, value: 8 },
          ],
        },
      })
      expect(result.results[2]).toMatchObject({
        ok: true,
        url: "https://example.com/7/8",
      })
    } finally {
      executor.send = send
    }
  })

  it("commits captures from HTTP failures for later requests", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "source.yml"),
      "name: 1 Source\nmethod: GET\nurl: https://example.com/source\ncapture:\n  error_id: body.id\n",
    )
    await writeFile(
      join(dir, "use.yml"),
      "name: 2 Use\nmethod: GET\nurl: https://example.com/errors/$error_id\n",
    )
    const send = executor.send
    executor.send = async (request) => ({
      status: request.id === "source" ? 500 : 200,
      statusText: request.id === "source" ? "Error" : "OK",
      headers: {},
      body: '{"id":"err-1"}',
      timeMs: 1,
    })
    try {
      const result = await collectionRun(dir)
      expect(result.failed).toBe(true)
      expect(result.results[0]).toMatchObject({
        ok: false,
        captures: { results: [{ success: true, value: "err-1" }] },
      })
      expect(result.results[1]).toMatchObject({
        ok: true,
        url: "https://example.com/errors/err-1",
      })
    } finally {
      executor.send = send
    }
  })

  it("does not roll back captures after an assertion failure", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "source.yml"),
      "name: 1 Source\nmethod: GET\nurl: https://example.com/source\ncapture:\n  user_id: body.id\nassert:\n  - expression: status\n    operator: equals\n    value: 201\n",
    )
    await writeFile(
      join(dir, "use.yml"),
      "name: 2 Use\nmethod: GET\nurl: https://example.com/users/$user_id\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: '{"id":42}',
      timeMs: 1,
    })
    try {
      const result = await collectionRun(dir)
      expect(result.results[0]).toMatchObject({
        ok: false,
        captures: { results: [{ success: true, value: 42 }] },
        assertions: { results: [{ passed: false }] },
      })
      expect(result.results[1]).toMatchObject({
        ok: true,
        url: "https://example.com/users/42",
      })
    } finally {
      executor.send = send
    }
  })

  it("isolates RunScope values between collection executions", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "source.yml"),
      "name: 1 Source\nmethod: GET\nurl: https://example.com/source\ncapture:\n  user_id: body.id\n",
    )
    await writeFile(
      join(dir, "use.yml"),
      "name: 2 Use\nmethod: GET\nurl: https://example.com/users/$user_id\n",
    )
    const send = executor.send
    let sends = 0
    executor.send = async () => {
      sends++
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        body: '{"id":42}',
        timeMs: 1,
      }
    }
    try {
      expect((await collectionRun(dir)).failed).toBe(false)
      const isolated = await collectionRun(
        dir,
        undefined,
        undefined,
        false,
        undefined,
        false,
        ["use"],
      )
      expect(isolated.results[0]).toMatchObject({ ok: false })
      expect(isolated.results[0]).not.toHaveProperty("captures")
      expect(isolated.results[0]?.error).toContain(
        'unresolved variable "user_id"',
      )
      expect(sends).toBe(2)
    } finally {
      executor.send = send
    }
  })

  it("fails unresolved variables before sending without an environment", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com/$MISSING\ncapture:\n  id: body.id\n",
    )
    const send = executor.send
    let sends = 0
    executor.send = async () => {
      sends++
      throw new Error("should not send")
    }
    try {
      const result = await requestRun("request", dir)
      expect(sends).toBe(0)
      expect(result.result).toMatchObject({
        ok: false,
        captures: { evaluated: false, results: [] },
      })
      expect(result.result.error).toContain('unresolved variable "MISSING"')
    } finally {
      executor.send = send
    }
  })

  it("redacts known secrets in capture results but keeps raw scope values for sending", async () => {
    const key = "NOODLE_CAPTURE_SECRET"
    const originalValue = process.env[key]
    const send = executor.send
    try {
      process.env[key] = "capture-secret"
      await writeFile(
        join(dir, "settings.yml"),
        "environment: development\ncookies:\n  enabled: false\n",
      )
      await env.saveEnvironment(join(dir, ".environments"), {
        name: "development",
        vars: { BASE_URL: "https://example.com" },
        secretVars: { [key]: "process" },
      })
      await writeFile(
        join(dir, "source.yml"),
        "name: 1 Source\nmethod: GET\nurl: $BASE_URL/source\ncapture:\n  captured: body.token\n",
      )
      await writeFile(
        join(dir, "use.yml"),
        "name: 2 Use\nmethod: GET\nurl: $BASE_URL/$captured\n",
      )
      let rawCapturedValue: string | undefined
      executor.send = async (request, options) => {
        if (request.id === "use") {
          rawCapturedValue = options?.environment?.vars.captured
        }
        return {
          status: 200,
          statusText: "OK",
          headers: {},
          body: '{"token":"capture-secret"}',
          timeMs: 1,
        }
      }

      const result = await collectionRun(dir)
      expect(rawCapturedValue).toBe("capture-secret")
      expect(result.results[0]).toMatchObject({
        response: { body: '{"token":"capture-secret"}' },
        captures: { results: [{ success: true, value: "[REDACTED]" }] },
      })
      expect(result.results[1]?.url).toBe("https://example.com/[REDACTED]")
    } finally {
      executor.send = send
      if (originalValue === undefined) delete process.env[key]
      else process.env[key] = originalValue
    }
  })

  it("evaluates passing assertions for request run", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\nassert:\n  - expression: status\n    operator: equals\n    value: 201\n  - expression: body.id\n    operator: isNumber\n  - expression: headers.X-Trace\n    operator: equals\n    value: abc\n  - expression: response.time\n    operator: lt\n    value: 500\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 201,
      statusText: "Created",
      headers: { "x-trace": "abc" },
      body: '{"id":42}',
      timeMs: 12,
    })
    try {
      const result = await requestRun("request", dir)
      expect(result.failed).toBe(false)
      expect(result.result.ok).toBe(true)
      expect(result.result.assertions).toMatchObject({
        evaluated: true,
        results: [
          { expression: "status", passed: true, actual: 201 },
          { expression: "body.id", passed: true, actual: 42 },
          { expression: "headers.X-Trace", passed: true, actual: "abc" },
          { expression: "response.time", passed: true, actual: 12 },
        ],
      })
    } finally {
      executor.send = send
    }
  })

  it("omits disabled-only declarations from run results and summaries", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\ncapture:\n  id: { value: body.id, enabled: false }\nassert:\n  - expression: body.missing\n    operator: exists\n    enabled: false\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: '{"id":42}',
      timeMs: 1,
    })
    try {
      const result = await collectionRun(dir)
      expect(result.failed).toBe(false)
      expect(result.results[0]).not.toHaveProperty("captures")
      expect(result.results[0]).not.toHaveProperty("assertions")
      expect(result.results[0]?.failureCategories).toEqual([])
      expect(result.summary).toMatchObject({
        assertionPasses: 0,
        assertionFailures: 0,
        captureFailures: 0,
        failureCategories: [],
      })
    } finally {
      executor.send = send
    }
  })

  it("marks collection run failed when any assertion fails", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "passing.yml"),
      "name: Passing\nmethod: GET\nurl: https://example.com/pass\nassert:\n  - expression: status\n    operator: equals\n    value: 200\n",
    )
    await writeFile(
      join(dir, "failing.yml"),
      "name: Failing\nmethod: GET\nurl: https://example.com/fail\nassert:\n  - expression: body.id\n    operator: equals\n    value: 99\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: '{"id":42}',
      timeMs: 1,
    })
    try {
      const result = await collectionRun(dir)
      expect(result.failed).toBe(true)
      expect(
        result.results.find((item) => item.id === "passing"),
      ).toMatchObject({ ok: true, assertions: { evaluated: true } })
      const failed = result.results.find((item) => item.id === "failing")!
      expect(failed).toMatchObject({
        ok: false,
        response: { body: '{"id":42}' },
        assertions: {
          evaluated: true,
          results: [
            {
              expected: 99,
              actual: 42,
              passed: false,
              message: "Expected values to be equal",
            },
          ],
        },
      })
    } finally {
      executor.send = send
    }
  })

  it("reports declared assertions as not evaluated when substitution fails", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "environment: development\ncookies:\n  enabled: false\n",
    )
    await env.saveEnvironment(join(dir, ".environments"), {
      name: "development",
      vars: {},
    })
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\nassert:\n  - expression: body.id\n    operator: equals\n    value: $MISSING\n",
    )
    const send = executor.send
    let calls = 0
    executor.send = async () => {
      calls++
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "{}",
        timeMs: 1,
      }
    }
    try {
      const result = await requestRun("request", dir)
      expect(calls).toBe(0)
      expect(result.result).toMatchObject({
        ok: false,
        assertions: { evaluated: false, results: [] },
      })
      expect(result.result.error).toContain('unresolved variable "MISSING"')
    } finally {
      executor.send = send
    }
  })

  it("omits assertion output for legacy requests", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 1,
    })
    try {
      const result = await requestRun("request", dir)
      expect(result.result.ok).toBe(true)
      expect(result.result).not.toHaveProperty("assertions")
    } finally {
      executor.send = send
    }
  })

  it("keeps HTTP failure in the aggregate result when assertions pass", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\nassert:\n  - expression: status\n    operator: equals\n    value: 500\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 500,
      statusText: "Error",
      headers: {},
      body: "{}",
      timeMs: 1,
    })
    try {
      const result = await requestRun("request", dir)
      expect(result).toMatchObject({
        failed: true,
        result: {
          ok: false,
          assertions: { evaluated: true, results: [{ passed: true }] },
        },
      })
    } finally {
      executor.send = send
    }
  })

  it("redacts secret expected values but preserves raw actual response values", async () => {
    const key = "NOODLE_ASSERTION_SECRET"
    const originalValue = process.env[key]
    const send = executor.send
    try {
      process.env[key] = "assertion-secret"
      await writeFile(
        join(dir, "settings.yml"),
        "environment: development\ncookies:\n  enabled: false\n",
      )
      await env.saveEnvironment(join(dir, ".environments"), {
        name: "development",
        vars: {},
        secretVars: { [key]: "process" },
      })
      await writeFile(
        join(dir, "request.yml"),
        `name: Request\nmethod: GET\nurl: https://example.com\nassert:\n  - expression: body.token\n    operator: equals\n    value: $${key}\n`,
      )
      executor.send = async () => ({
        status: 200,
        statusText: "OK",
        headers: {},
        body: '{"token":"assertion-secret"}',
        timeMs: 1,
      })
      const result = await requestRun("request", dir)
      expect(result.result.assertions?.results[0]).toMatchObject({
        expected: "[REDACTED]",
        actual: "assertion-secret",
        passed: true,
      })
      expect(result.result.assertions?.results[0]?.message).not.toContain(
        "assertion-secret",
      )
    } finally {
      executor.send = send
      if (originalValue === undefined) delete process.env[key]
      else process.env[key] = originalValue
    }
  })

  it("reports run progress before and after each collection request", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n")
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const send = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: "",
      timeMs: 1,
    })
    const progress: Array<[number, number]> = []
    try {
      await collectionRun(dir, undefined, (completed, total) =>
        progress.push([completed, total]),
      )
      expect(progress).toEqual([
        [0, 1],
        [1, 1],
      ])
    } finally {
      executor.send = send
    }
  })

  it("passes collection proxy policy and --noproxy to the executor", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "proxy:\n  mode: custom\n  url: http://proxy.test:8080\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const send = executor.send
    const policies: unknown[] = []
    executor.send = async (_request, options) => {
      policies.push(options?.proxyPolicy)
      return { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 1 }
    }
    try {
      await collectionRun(dir, undefined, undefined, false, {
        http: "http://system.test:8080",
        https: "http://system.test:8080",
        bypass: [],
      })
      await collectionRun(dir, undefined, undefined, true, {
        http: "http://system.test:8080",
        https: "http://system.test:8080",
        bypass: [],
      })
      expect(policies).toEqual([
        {
          kind: "custom",
          source: "collection",
          url: "http://proxy.test:8080",
          bypass: [],
        },
        { kind: "direct", source: "cli" },
      ])
    } finally {
      executor.send = send
    }
  })

  it("does not read authenticated proxy secrets when --noproxy wins", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "proxy:\n  mode: custom\n  url: http://proxy.test:8080\n  auth: true\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const unavailable: SecretBackend = {
      get: async () => {
        throw new Error("keychain unavailable")
      },
      set: async () => {},
      delete: async () => false,
    }
    setSecretBackendForTests(unavailable)
    const send = executor.send
    const policies: unknown[] = []
    executor.send = async (_request, options) => {
      policies.push(options?.proxyPolicy)
      return { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 1 }
    }
    try {
      await collectionRun(dir, undefined, undefined, true)
      expect(policies).toEqual([{ kind: "direct", source: "cli" }])
    } finally {
      executor.send = send
    }
  })

  it("loads credentials only for the selected collection proxy", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 11111111-1111-4111-8111-111111111111\ncookies:\n  enabled: false\nproxy:\n  mode: custom\n  url: http://proxy.test:8080\n  auth: true\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const reads: string[] = []
    setSecretBackendForTests({
      get: async ({ name }) => {
        reads.push(name)
        return name.endsWith("username") ? "alice" : "secret"
      },
      set: async () => {},
      delete: async () => false,
    })
    const send = executor.send
    const policies: unknown[] = []
    executor.send = async (_request, options) => {
      policies.push(options?.proxyPolicy)
      return { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 1 }
    }
    try {
      await collectionRun(dir)
      expect(
        reads.filter((name) => name.includes(":settings:proxy:")).sort(),
      ).toEqual([
        "11111111-1111-4111-8111-111111111111:settings:proxy:password",
        "11111111-1111-4111-8111-111111111111:settings:proxy:username",
      ])
      expect(policies).toEqual([
        {
          kind: "custom",
          source: "collection",
          url: "http://proxy.test:8080",
          bypass: [],
          auth: true,
          credentials: { username: "alice", password: "secret" },
        },
      ])
    } finally {
      executor.send = send
    }
  })

  it("passes collection TLS settings and --insecure to the executor", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "tls:\n  verify: true\n  ca_bundle: ./ca.pem\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const send = executor.send
    const policies: unknown[] = []
    executor.send = async (_request, options) => {
      policies.push(options?.tlsPolicy)
      return { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 1 }
    }
    try {
      await collectionRun(dir, undefined, undefined, false, undefined, true)
      expect(policies).toEqual([
        {
          collectionDir: dir,
          settings: { verify: true, caBundle: "./ca.pem" },
          insecure: true,
        },
      ])
    } finally {
      executor.send = send
    }
  })

  it("fails closed on invalid settings before sending, even with --insecure", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "tls:\n  client_certifcates: []\n",
    )
    await writeFile(
      join(dir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
    )
    const send = executor.send
    let calls = 0
    executor.send = async () => {
      calls++
      return { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 1 }
    }
    try {
      expect(
        await collectionRun(dir, undefined, undefined, false, undefined, true),
      ).toMatchObject({
        failed: true,
        failure: {
          category: "configuration",
          message:
            'filestore.loadSettings: tls: unknown key "client_certifcates"',
        },
      })
      expect(calls).toBe(0)
    } finally {
      executor.send = send
    }
  })

  it("does not audit nested settings files as collection settings", async () => {
    await mkdir(join(dir, "folder"))
    await writeFile(join(dir, "settings.yml"), "{}\n")
    await writeFile(join(dir, "folder", "settings.yml"), "environment: prod\n")
    const result = await collectionAudit(dir, true)
    expect(result.issues).toEqual([
      {
        path: "settings.yml",
        kind: "settings",
        message: "canonicalized",
        fixed: true,
      },
    ])
    expect(await readFile(join(dir, "folder", "settings.yml"), "utf8")).toBe(
      "environment: prod\n",
    )
    expect(await readFile(join(dir, "settings.yml"), "utf8")).toBe("{}\n")
  })

  it("audits and canonicalizes collection metadata and timeline retention", async () => {
    await writeFile(
      join(dir, "settings.yml"),
      "description: |-\n  First line.\n  Second line.\nname: Payments API\ntimeline_max_entries: 0\nenvironment: development\n",
    )

    const result = await collectionAudit(dir, true)

    expect(result.valid).toBe(true)
    expect(await collectionInspect(dir)).toMatchObject({
      settings: {
        name: "Payments API",
        description: "First line.\nSecond line.",
        timelineMaxEntries: 0,
        environment: "development",
      },
    })
  })

  it("canonicalizes folders without losing tags", async () => {
    await writeFile(join(dir, "settings.yml"), "{}\n")
    await mkdir(join(dir, "users"))
    await writeFile(
      join(dir, "users", "folder.yml"),
      "tags: [smoke, users]\nmeta: { name: Users, seq: 2 }\n",
    )

    const result = await collectionAudit(dir, true)

    expect(result.valid).toBe(true)
    expect(await readFile(join(dir, "users", "folder.yml"), "utf8")).toBe(
      "meta:\n  name: Users\n  seq: 2\ntags:\n  - smoke\n  - users\n",
    )
  })

  it("rejects invalid timeline retention during collection audit", async () => {
    await writeFile(join(dir, "settings.yml"), "timeline_max_entries: -1\n")
    const result = await collectionAudit(dir, false)
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.message).toContain(
      "timeline_max_entries must be a non-negative integer",
    )
  })

  it("reports invalid registered collections without changing config", async () => {
    const configDir = join(dir, "config")
    const missing = join(dir, "missing")
    const uninitialized = join(dir, "uninitialized")
    await mkdir(configDir)
    await mkdir(uninitialized)
    await writeFile(
      join(configDir, "config.yml"),
      `collections:\n  - ${missing}\n  - ${uninitialized}\n`,
      "utf8",
    )

    const result = await workspaceAudit(false, configDir)

    expect(result.valid).toBe(false)
    expect(result.collections).toEqual([missing, uninitialized])
    expect(result.issues).toEqual([
      { path: missing, message: "directory does not exist", fixed: false },
      { path: uninitialized, message: "not a collection root", fixed: false },
    ])
    expect(await readFile(join(configDir, "config.yml"), "utf8")).toContain(
      missing,
    )
  })

  it("removes invalid registered collections when fixed", async () => {
    const configDir = join(dir, "config")
    const missing = join(dir, "missing")
    const valid = join(dir, "valid")
    await mkdir(configDir)
    await mkdir(valid)
    await writeFile(join(valid, "settings.yml"), "{}\n", "utf8")
    await writeFile(
      join(configDir, "config.yml"),
      `collections:\n  - ${missing}\n  - ${valid}\n`,
      "utf8",
    )

    const result = await workspaceAudit(true, configDir)

    expect(result.valid).toBe(true)
    expect(result.collections).toEqual([valid])
    expect(result.issues).toEqual([
      { path: missing, message: "directory does not exist", fixed: true },
    ])
    expect(await readFile(join(configDir, "config.yml"), "utf8")).not.toContain(
      missing,
    )
  })

  it("rejects traversal, empty-segment, and hidden request IDs", () => {
    for (const id of ["../secret", "nested/", "nested//request", ".hidden"]) {
      expect(() => validateId(id)).toThrow(`invalid request id "${id}"`)
    }
  })
})

describe("automation cookie jar", () => {
  function memoryBackend(): SecretBackend {
    const values = new Map<string, string>()
    return {
      async get({ service, name }) {
        return values.get(`${service}:${name}`) ?? null
      },
      async set({ service, name, value }) {
        values.set(`${service}:${name}`, value)
      },
      async delete({ service, name }) {
        return values.delete(`${service}:${name}`)
      },
    }
  }

  it("lists and clears the per-collection cookie jar", async () => {
    setSecretBackendForTests(memoryBackend())
    const collectionDir = join(dir, "collection")
    await mkdir(collectionDir)
    await writeFile(join(collectionDir, "settings.yml"), "", "utf8")
    await writeFile(
      join(collectionDir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
      "utf8",
    )
    const configDir = join(dir, "config")

    expect(await cookieList(collectionDir, configDir)).toEqual({
      disabled: false,
      state: "encrypted",
      warnings: [],
      cookies: [],
    })

    const { loadSettings } = await import("../../src/filestore")
    const collectionId = (await loadSettings(collectionDir)).collectionId
    expect(collectionId).toBeDefined()

    const { CollectionCookieJar } = await import("../../src/cookies")
    const jar = await CollectionCookieJar.open(configDir, collectionId!)
    jar.put({ name: "session", value: "abc", domain: "example.com" })
    await jar.saveNow()

    const { cookies } = await cookieList(collectionDir, configDir)
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatchObject({
      name: "session",
      value: "abc",
      domain: "example.com",
    })

    expect(await cookieClear(collectionDir, configDir)).toEqual({
      disabled: false,
      state: "encrypted",
      warnings: [],
    })
    expect(await cookieList(collectionDir, configDir)).toEqual({
      disabled: false,
      state: "encrypted",
      warnings: [],
      cookies: [],
    })
  })

  it("reports disabled when cookies.enabled is false", async () => {
    setSecretBackendForTests(memoryBackend())
    const collectionDir = join(dir, "disabled")
    await mkdir(collectionDir)
    await writeFile(
      join(collectionDir, "settings.yml"),
      "cookies:\n  enabled: false\n",
      "utf8",
    )
    expect(await cookieList(collectionDir, join(dir, "config"))).toEqual({
      disabled: true,
      state: "disabled",
      warnings: [],
      cookies: [],
    })
    expect(await cookieClear(collectionDir, join(dir, "config"))).toEqual({
      disabled: true,
      state: "disabled",
      warnings: [],
    })
  })

  it("reports plaintext warnings and host-only metadata", async () => {
    const failingBackend: SecretBackend = {
      async get() {
        throw new Error("no keyring")
      },
      async set() {
        throw new Error("no keyring")
      },
      async delete() {
        return false
      },
    }
    setSecretBackendForTests(failingBackend)
    const collectionDir = join(dir, "plaintext")
    await mkdir(collectionDir)
    await writeFile(join(collectionDir, "settings.yml"), "", "utf8")
    await writeFile(
      join(collectionDir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
      "utf8",
    )
    const configDir = join(dir, "config")
    await cookieList(collectionDir, configDir)
    const { loadSettings } = await import("../../src/filestore")
    const { CollectionCookieJar } = await import("../../src/cookies")
    const collectionId = (await loadSettings(collectionDir)).collectionId!
    const jar = await CollectionCookieJar.open(configDir, collectionId)
    jar.put({
      name: "session",
      value: "abc",
      domain: "example.com",
      hostOnly: true,
    })
    await jar.saveNow()

    const result = await cookieList(collectionDir, configDir)

    expect(result.state).toBe("plaintext-warning")
    expect(result.warnings).toHaveLength(1)
    expect(result.cookies[0]?.hostOnly).toBe(true)
  })

  it("backs up unreadable storage when cookie clear resets it", async () => {
    setSecretBackendForTests(memoryBackend())
    const collectionDir = join(dir, "recovery")
    await mkdir(collectionDir)
    await writeFile(join(collectionDir, "settings.yml"), "", "utf8")
    await writeFile(
      join(collectionDir, "request.yml"),
      "name: Request\nmethod: GET\nurl: https://example.com\n",
      "utf8",
    )
    const configDir = join(dir, "config")
    await cookieList(collectionDir, configDir)
    const { loadSettings } = await import("../../src/filestore")
    const collectionId = (await loadSettings(collectionDir)).collectionId!
    const file = join(configDir, "cookies", `${collectionId}.json`)
    await writeFile(file, "plain:{broken", "utf8")

    const unavailable = await cookieList(collectionDir, configDir)
    expect(unavailable.state).toBe("unavailable")
    expect(unavailable.warnings).toHaveLength(1)
    expect(await readFile(file, "utf8")).toBe("plain:{broken")

    const cleared = await cookieClear(collectionDir, configDir)

    expect(cleared).toMatchObject({
      disabled: false,
      state: "encrypted",
      warnings: [],
    })
    expect(cleared.backupPath).toBeDefined()
    expect(await readFile(cleared.backupPath!, "utf8")).toBe("plain:{broken")
    expect((await cookieList(collectionDir, configDir)).cookies).toEqual([])
  })
})
