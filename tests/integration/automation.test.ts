import { afterEach, beforeEach, describe, expect, it } from "bun:test"
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
  environmentSet,
  requestCreate,
  requestRun,
  validateId,
  workspaceAudit,
} from "../../src/app/services"
import { collection as collectionCommand } from "../../src/app/commands/automation"
import { env } from "../../src/env"
import { executor } from "../../src/requests"

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
      'name: JSON\nmethod: POST\nurl: https://example.com\nbody: \'{"name":"Noodle","id":9007199254740993}\'\nbody_type: json\n',
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
      await expect(
        collectionRun(dir, undefined, undefined, false, undefined, true),
      ).rejects.toThrow('tls: unknown key "client_certifcates"')
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
