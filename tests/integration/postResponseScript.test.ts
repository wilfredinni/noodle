import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import { CollectionCookieJar } from "../../src/cookies"
import { setSecretBackendForTests } from "../../src/secrets"
import { collectionRun, requestRun } from "../../src/app/services"
import { lang } from "../../src/lang"
import { formatRequestRun } from "../../src/app/humanOutput"
import type { Request } from "../../src/schema"

let dir: string
let server: ReturnType<typeof Bun.serve>
let url: string
let seen: {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}[]
let jars: CollectionCookieJar[]
const base = (): Request => ({
  id: "first",
  name: "First",
  method: "GET",
  url: `${url}/api/users`,
  headers: {},
  params: [],
  timeout: 0,
})
const send = (
  request: Request,
  scope = new RunScope(),
  cookies?: CollectionCookieJar,
) =>
  executeRequestLifecycle({
    request,
    runScope: scope,
    transport: { proxyPolicy: { kind: "direct", source: "cli" }, cookies },
  })
const openJar = async (id = "test") => {
  const jar = await CollectionCookieJar.open(dir, id)
  jars.push(jar)
  return jar
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-post-"))
  seen = []
  jars = []
  const vault = new Map<string, string>()
  setSecretBackendForTests({
    async get({ service, name }) {
      return vault.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value }) {
      vault.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      return vault.delete(`${service}:${name}`)
    },
  })
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      seen.push({
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      })
      if (path === "/redirect")
        return new Response(null, {
          status: 303,
          headers: {
            location: "/api/users?final=yes",
            "set-cookie": "redirectCookie=received; Path=/",
          },
        })
      return Response.json(
        { id: 7, token: "server-token" },
        {
          status: path === "/error" ? 422 : 200,
          headers: {
            "x-response": "yes",
            "set-cookie": "received=r; Path=/; HttpOnly",
            ...(path === "/sensitive"
              ? { authorization: "Bearer opaque-value" }
              : {}),
          },
        },
      )
    },
  })
  url = `http://127.0.0.1:${server.port}`
})
afterEach(async () => {
  await Promise.all(jars.map((jar) => jar.close()))
  server.stop(true)
  setSecretBackendForTests(undefined)
  await rm(dir, { recursive: true, force: true })
})

describe("post-response lifecycle", () => {
  it("retains child cookies and received cookies after parent variable rollback", async () => {
    const jar = await openJar()
    const scope = new RunScope()
    const child: Request = {
      ...base(),
      id: "child",
      scripts: {
        post: 'noodle.cookies.set({name:"child",value:"child-cookie"}); noodle.run.set("CHILD", true)',
      },
    }
    const root: Request = {
      ...base(),
      id: "root",
      scripts: {
        post: 'noodle.cookies.set({name:"parent",value:"parent-cookie"}); await noodle.runRequest("child"); throw Error("rollback parent")',
      },
    }
    const result = await executeRequestLifecycle({
      request: root,
      runScope: scope,
      collection: {
        id: "test",
        name: "Test",
        items: [root, child].map((data) => ({ type: "request", data })),
      },
      transport: {
        proxyPolicy: { kind: "direct", source: "cli" },
        cookies: jar,
      },
    })
    expect(result.status).toBe("done")
    expect(result.execution.scripts?.results[0]?.success).toBe(false)
    expect(scope.get("CHILD")).toBeUndefined()
    const current = jar.scriptTransaction(root.url, () => {})!
    expect(current.get("child")).toBe("child-cookie")
    expect(current.get("parent")).toBeNull()
    expect(current.get("received")).toBe("r")
  })

  it("carries time values across requests and retains pre/post failure semantics", async () => {
    const scope = new RunScope()
    const first = await send(
      {
        ...base(),
        scripts: {
          pre: `const now = noodle.time.parse("2026-01-01"); noodle.request.headers.set("X-Time", noodle.time.iso(now)); noodle.run.set("expiresAt", noodle.time.add(now, 15, "minutes"));`,
          post: `noodle.run.set("localExpiry", noodle.time.format(noodle.run.get("expiresAt"), "HH:mm Z", {timeZone:"Asia/Kathmandu"}));`,
        },
      },
      scope,
    )
    expect(
      first.execution.scripts?.results.map((result) => result.success),
    ).toEqual([true, true])
    expect(seen[0]?.headers["x-time"]).toBe("2026-01-01T00:00:00.000Z")
    expect(scope.get("localExpiry")).toBe("06:00 +05:45")
    await send(
      {
        ...base(),
        headers: { "X-Expiry": { value: "$localExpiry", enabled: true } },
      },
      scope,
    )
    expect(seen[1]?.headers["x-expiry"]).toBe("06:00 +05:45")
    const failedPre = await send(
      {
        ...base(),
        scripts: {
          pre: `noodle.run.set("localExpiry", "discarded"); noodle.time.parse("2026-02-30");`,
        },
      },
      scope,
    )
    expect(failedPre.status).toBe("error")
    expect(failedPre.execution.scripts?.results[0]?.success).toBe(false)
    expect(seen).toHaveLength(2)
    const failedPost = await send(
      {
        ...base(),
        captures: { capturedId: { value: "body.id", enabled: true } },
        assertions: [{ expression: "status", operator: "equals", value: 200 }],
        scripts: {
          post: `noodle.run.set("localExpiry", "discarded"); noodle.time.format(0, "YYYY", {timeZone:"Missing/Zone"});`,
        },
      },
      scope,
    )
    expect(failedPost.status).toBe("done")
    if (failedPost.status !== "done") throw Error("Expected a response")
    expect(failedPost.response.status).toBe(200)
    expect(failedPost.execution.scripts?.results[0]?.success).toBe(false)
    expect(failedPost.execution.assertions?.results[0]?.passed).toBe(true)
    expect(scope.get("capturedId")).toBe(7)
    expect(scope.get("localExpiry")).toBe("06:00 +05:45")
  })

  it("sends generated pre data, carries post data forward and preserves lifecycle rollback", async () => {
    const scope = new RunScope()
    const first = await send(
      {
        ...base(),
        method: "POST",
        scripts: {
          pre: `noodle.random.seed(42); const user = { id: noodle.random.uuid(), name: noodle.random.name(), email: noodle.random.exampleEmail() }; noodle.run.set("user", user); noodle.request.body.setJson(user);`,
          post: `noodle.random.seed(7); noodle.run.set("nextId", noodle.random.id());`,
        },
      },
      scope,
    )
    expect(
      first.execution.scripts?.results.map((result) => result.success),
    ).toEqual([true, true])
    expect(JSON.parse(seen[0]!.body)).toEqual(scope.get("user"))
    const nextId = scope.get("nextId")
    await send(
      { ...base(), headers: { "X-Next": { value: "$nextId", enabled: true } } },
      scope,
    )
    expect(seen[1]!.headers["x-next"]).toBe(nextId as string)

    const failedPre = await send(
      {
        ...base(),
        scripts: {
          pre: `noodle.run.set("nextId", "discarded"); noodle.request.headers.set("X-Staged", "discarded"); noodle.random.id({length: 4097});`,
        },
      },
      scope,
    )
    expect(failedPre.status).toBe("error")
    if (failedPre.status !== "error") throw Error("Expected a script failure")
    expect(failedPre.failureCategory).toBe("script")
    expect(seen).toHaveLength(2)
    expect(scope.get("nextId")).toBe(nextId)

    const failedPost = await send(
      {
        ...base(),
        captures: { capturedId: { value: "body.id", enabled: true } },
        assertions: [{ expression: "status", operator: "equals", value: 200 }],
        scripts: {
          post: `noodle.random.seed(42); const password = noodle.random.password(); console.log(password); noodle.run.set("nextId", noodle.random.uuid()); throw Error(password);`,
        },
      },
      scope,
    )
    expect(failedPost.status).toBe("done")
    if (failedPost.status !== "done") throw Error("Expected a response")
    expect(failedPost.response.status).toBe(200)
    expect(failedPost.execution.assertions?.results[0]?.passed).toBe(true)
    expect(scope.get("capturedId")).toBe(7)
    expect(scope.get("nextId")).toBe(nextId)
    expect(failedPost.execution.scripts?.results[0]).toMatchObject({
      success: false,
      logs: [{ message: "[REDACTED]" }],
      error: { message: "[REDACTED]" },
    })
  })

  it("keeps sensitive response values secret in post writes and later request output", async () => {
    const scope = new RunScope()
    const first = await send(
      {
        ...base(),
        url: `${url}/sensitive`,
        scripts: {
          post: `noodle.run.set("copied", noodle.response.headers.get("AUTHORIZATION").slice(7)); noodle.run.set("public", noodle.response.headers.get("x-response"));`,
        },
      },
      scope,
    )
    expect(first.execution.scripts?.results[0]?.success).toBe(true)
    expect(scope.get("copied")).toBe("opaque-value")
    expect(scope.isSecret("copied")).toBe(true)
    expect(scope.isSecret("public")).toBe(false)

    const second = await send(
      {
        ...base(),
        headers: { "X-Public": { value: "$copied", enabled: true } },
        scripts: {
          post: `console.log(noodle.request.headers.get("X-Public"));`,
        },
      },
      scope,
    )
    expect(seen[1]?.headers["x-public"]).toBe("opaque-value")
    expect(second.execution.scripts?.results[0]).toMatchObject({
      success: true,
      logs: [{ message: "[REDACTED]" }],
    })
  })

  it("restricts cookie scope, deletes applicable duplicates, and supports expiry and secure prefixes", async () => {
    const jar = await openJar()
    for (const [path, value] of [
      ["/", "root"],
      ["/api", "scoped"],
      ["/private", "inaccessible"],
    ])
      jar.put({
        name: "duplicate",
        value: value!,
        domain: "127.0.0.1",
        hostOnly: true,
        path: path!,
      })
    const secrets = new Set<string>()
    const transaction = jar.scriptTransaction(`${url}/api/users`, (value) =>
      secrets.add(value),
    )!
    expect(transaction.get("duplicate")).toBe("scoped")
    expect(transaction.get("missing")).toBeNull()
    transaction.delete("duplicate")
    expect(transaction.get("duplicate")).toBeNull()
    expect(
      jar.list().filter((cookie) => cookie.name === "duplicate"),
    ).toHaveLength(3)
    transaction.set({
      name: "session",
      value: "session",
      httpOnly: true,
      sameSite: "strict",
    })
    transaction.set({
      name: "past",
      value: "expired",
      expires: "2000-01-01T00:00:00Z",
    })
    transaction.commit(() => {})
    expect(
      jar.list().filter((cookie) => cookie.name === "duplicate"),
    ).toMatchObject([{ path: "/private", value: "inaccessible" }])
    expect(
      jar.list().find((cookie) => cookie.name === "session"),
    ).toMatchObject({
      path: "/api",
      hostOnly: true,
      expires: null,
      httpOnly: true,
      sameSite: "strict",
    })
    expect(jar.cookieHeaderFor(`${url}/api/users`)).not.toContain("past=")
    expect([...secrets]).toEqual(
      expect.arrayContaining(["root", "scoped", "expired", "session"]),
    )
    expect(secrets.has("inaccessible")).toBe(false)
    for (const input of [
      { name: "x", value: "v", domain: "127.0.0.1" },
      { name: "x", value: "v", path: "/private" },
      { name: "x", value: "v", path: "api" },
      { name: "x", value: "v", path: "/; Domain=other" },
      { name: "x", value: "v", secure: "true" },
      { name: "x", value: "v", httpOnly: 1 },
      { name: "x", value: "v", expires: "tomorrow" },
      { name: "x", value: "v", expires: "2026-02-31T00:00:00Z" },
      { name: "x", value: "v", expires: null },
      { name: "x", value: "v", sameSite: "invalid" },
      { name: "__Secure-bad", value: "v" },
      { name: "__Host-bad", value: "v", secure: true, path: "/api" },
      { name: "x; Domain=other", value: "v" },
      { name: "x", value: "v; Domain=other" },
    ])
      expect(() =>
        jar.scriptTransaction(`${url}/api/users`, () => {})!.set(input),
      ).toThrow()
    expect(() =>
      jar
        .scriptTransaction("http://example.com/api/users", () => {})!
        .set({ name: "secure", value: "v", secure: true }),
    ).toThrow("not applicable")
    const secure = jar.scriptTransaction(
      "http://localhost/api/users",
      () => {},
    )!
    secure.set({
      name: "__Host-valid",
      value: "v",
      secure: true,
      path: "/",
      sameSite: "none",
    })
    secure.commit(() => {})
    expect(jar.cookieHeaderFor("http://localhost/api/users")).toContain(
      "__Host-valid=v",
    )
  })

  it("revalidates staged batches against current state and retains concurrent deferred persistence", async () => {
    const jar = await openJar("shared")
    const other = await openJar("shared")
    const transaction = jar.scriptTransaction(`${url}/api/users`, () => {})!
    transaction.set({ name: "post", value: "post" })
    jar.put({
      name: "concurrent",
      value: "current",
      domain: "127.0.0.1",
      hostOnly: true,
    })
    transaction.commit(() => {})
    const external = other.scriptTransaction(`${url}/api/users`, () => {})!
    external.set({ name: "other", value: "other" })
    external.commit(() => {})
    await Promise.all([jar.saveNow(), other.saveNow()])
    await jar.refresh()
    expect(jar.cookieHeaderFor(`${url}/api/users`)).toContain("post=post")
    expect(jar.cookieHeaderFor(`${url}/api/users`)).toContain(
      "concurrent=current",
    )
    expect(jar.cookieHeaderFor(`${url}/api/users`)).toContain("other=other")
    const closed = jar.scriptTransaction(`${url}/api/users`, () => {})!
    closed.set({ name: "rollback", value: "private" })
    await jar.close()
    let committed = false
    expect(() =>
      closed.commit(() => {
        committed = true
      }),
    ).toThrow("unavailable")
    expect(committed).toBe(false)
    expect(jar.cookieHeaderFor(`${url}/api/users`)).not.toContain("rollback=")
    expect(jar.scriptTransaction(`${url}/api/users`, () => {})).toBeUndefined()
  })
  it("runs captures before post, keeps pre writes and runs assertions after post failure", async () => {
    const scope = new RunScope()
    const result = await send(
      {
        ...base(),
        url: `${url}/error`,
        scripts: {
          pre: `noodle.run.set("pre", 1); noodle.request.headers.set("X-Pre", "yes"); console.log("server-token")`,
          post: `if (noodle.run.get("id") !== 7 || noodle.run.get("pre") !== 1 || noodle.response.status !== 422) throw Error("order"); noodle.run.set("post", 2); console.log("diagnostics"); throw Error("post failed")`,
        },
        captures: {
          id: { value: "body.id", enabled: true },
          missing: { value: "body.missing", enabled: true },
        },
        assertions: [{ expression: "status", operator: "equals", value: 422 }],
      },
      scope,
    )
    expect(result.status).toBe("done")
    if (result.status !== "done") throw result.error
    expect(result.response.status).toBe(422)
    expect(
      result.execution.scripts?.results.map((script) => [
        script.phase,
        script.success,
      ]),
    ).toEqual([
      ["pre", true],
      ["post", false],
    ])
    expect(result.execution.assertions?.results[0]?.passed).toBe(true)
    expect(
      result.execution.captures?.results.map((capture) => capture.success),
    ).toEqual([true, false])
    expect(scope.get("pre")).toBe(1)
    expect(scope.get("id")).toBe(7)
    expect(scope.get("post")).toBeUndefined()
    expect(seen[0]?.headers["x-pre"]).toBe("yes")
  })

  it("reads only the final prepared leg after redirect, auth and cookie preparation", async () => {
    const jar = await openJar()
    const scope = new RunScope()
    const result = await send(
      {
        ...base(),
        method: "POST",
        url: `${url}/redirect`,
        bodyType: "json",
        body: '{"original":true}',
        scripts: {
          post: `noodle.run.set("final", {url: noodle.request.url, method: noodle.request.method, param: noodle.request.params.get("final"), cookie: noodle.request.headers.get("cookie"), body: noodle.request.body.text(), contentType: noodle.request.headers.get("content-type")}); noodle.run.set("invocations", (noodle.run.get("invocations") || 0) + 1)`,
        },
      },
      scope,
      jar,
    )
    expect(result.status).toBe("done")
    expect(scope.get("final")).toMatchObject({
      url: `${url}/api/users?final=yes`,
      method: "GET",
      param: "yes",
      cookie: "redirectCookie=received",
      body: null,
      contentType: null,
    })
    expect(scope.get("invocations")).toBe(1)
    expect(seen.map((request) => request.method)).toEqual(["POST", "GET"])
    const signed = await send(
      {
        ...base(),
        auth: {
          type: "aws_sigv4",
          access_key: "access",
          secret_key: "signing-secret",
          region: "us-east-1",
          service: "execute-api",
        },
        scripts: {
          post: `noodle.run.set("authorization", noodle.request.headers.get("Authorization")); noodle.run.set("date", noodle.request.headers.get("x-amz-date"))`,
        },
      },
      scope,
    )
    expect(signed.status).toBe("done")
    expect(scope.get("authorization")).toBe(seen[2]?.headers.authorization)
    expect(scope.get("date")).toBe(seen[2]?.headers["x-amz-date"])
  })

  it("omits unexecuted phases and preserves no-script and empty post behavior", async () => {
    const fail = await send({
      ...base(),
      scripts: { pre: `throw Error("stop")`, post: `throw Error("never")` },
    })
    expect(fail.status).toBe("error")
    expect(
      fail.execution.scripts?.results.map((script) => script.phase),
    ).toEqual(["pre"])
    expect(seen).toHaveLength(0)
    expect((await send(base())).execution).not.toHaveProperty("scripts")
    expect(
      (await send({ ...base(), scripts: { post: "" } })).execution.scripts
        ?.results,
    ).toMatchObject([{ phase: "post", success: true }])
    server.stop(true)
    const transportFailure = await send({
      ...base(),
      scripts: { post: `throw Error("never")` },
    })
    expect(transportFailure.status).toBe("error")
    expect(transportFailure.execution.scripts?.results).toEqual([])
  })

  it("persists the captured value, not post writes, even when post fails", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await mkdir(join(dir, ".environments"))
    const environment = join(dir, ".environments", "test.env")
    for (const fail of [false, true]) {
      await writeFile(environment, "ID=initial\n")
      await writeFile(
        join(dir, "first.yml"),
        lang.serializeRequest({
          ...base(),
          captures: {
            ID: { value: "body.id", enabled: true, persist: "environment" },
          },
          scripts: {
            post: `if (noodle.run.get("ID") !== 7 || noodle.env.get("ID") !== "initial") throw Error("capture order"); noodle.run.set("ID", "transient"); ${fail ? 'throw Error("post failed")' : ""}`,
          },
          assertions: [{ expression: "body.id", operator: "equals", value: 7 }],
        }),
      )
      const result = await requestRun("first", dir, "test", undefined, true)
      expect(result.failed).toBe(fail)
      const capture = result.result.captures?.results[0]
      expect(capture?.success).toBe(true)
      if (!capture?.success) throw Error("capture failed")
      expect(capture.persisted).toBe("environment")
      expect(result.result.assertions?.results[0]?.passed).toBe(true)
      expect(await readFile(environment, "utf8")).toContain("ID=7")
      expect(await readFile(environment, "utf8")).not.toContain("transient")
    }
  })

  it("atomically rolls back cookie and RunScope writes while preserving Set-Cookie and redacting failed logs", async () => {
    const jar = await openJar()
    const scope = new RunScope()
    const result = await send(
      {
        ...base(),
        captures: { token: { value: "body.token", enabled: true } },
        scripts: {
          pre: `console.log("post-token")`,
          post: `noodle.run.set("staged", 1); noodle.cookies.set({name:"session",value:"post-token"}); console.log(noodle.cookies.get("received"), "post-token"); noodle.cookies.set({name:"bad",value:"x",domain:"elsewhere.test"})`,
        },
        assertions: [{ expression: "body.token", operator: "isString" }],
      },
      scope,
      jar,
    )
    expect(
      result.execution.scripts?.results.map((script) => script.success),
    ).toEqual([true, false])
    expect(scope.get("staged")).toBeUndefined()
    expect(scope.get("token")).toBe("server-token")
    expect(jar.cookieHeaderFor(`${url}/api/users`)).toBe("received=r")
    expect(JSON.stringify(result.execution)).not.toContain("post-token")
    expect(result.execution.assertions?.results[0]?.passed).toBe(true)
    expect(result.secretValues).toContain("r")
  })

  it("commits cookies and RunScope together and preserves suppression", async () => {
    const jar = await openJar()
    const scope = new RunScope()
    let observed: unknown
    jar.subscribe(() => {
      if (scope.get("committed"))
        observed = jar.cookieHeaderFor(`${url}/api/users`)
    })
    const result = await send(
      {
        ...base(),
        scripts: {
          post: `noodle.cookies.set({name:"session",value:"s",httpOnly:true,sameSite:"lax"}); noodle.run.set("committed", true)`,
        },
        assertions: [{ expression: "status", operator: "equals", value: 201 }],
      },
      scope,
      jar,
    )
    expect(result.execution.scripts?.results[0]?.success).toBe(true)
    expect(result.execution.assertions?.results[0]?.passed).toBe(false)
    expect(observed).toContain("session=s")
    const suppressed = await send(
      {
        ...base(),
        sendCookies: false,
        scripts: {
          post: `if (typeof noodle.cookies !== "undefined") throw Error("capability")`,
        },
      },
      new RunScope(),
      jar,
    )
    expect(suppressed.execution.scripts?.results[0]?.success).toBe(true)
    expect(seen[1]?.headers.cookie).toBeUndefined()
    expect(jar.cookieHeaderFor(`${url}/api/users`)).toContain("received=r")
    expect(
      (
        await send({
          ...base(),
          scripts: {
            post: `if (typeof noodle.cookies !== "undefined") throw Error("capability")`,
          },
        })
      ).execution.scripts?.results[0]?.success,
    ).toBe(true)
  })

  it("propagates post values through collection runs, continues after diagnostics and isolates request runs", async () => {
    await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
    await mkdir(join(dir, "folder"))
    await writeFile(
      join(dir, "folder", "folder.yml"),
      "headers:\n  X-Folder: inherited\n",
    )
    const first: Request = {
      ...base(),
      id: "folder/first",
      url: `${url}/error`,
      scripts: {
        pre: `if (noodle.request.headers.get("X-Folder") !== "inherited") throw Error("merge")`,
        post: `noodle.run.set("next", noodle.response.json().id); console.log("safe diagnostic")`,
      },
      captures: { missing: { value: "body.missing", enabled: true } },
      assertions: [{ expression: "status", operator: "equals", value: 200 }],
    }
    const second: Request = {
      ...base(),
      id: "folder/second",
      url: `${url}/api/users?id=$next`,
      scripts: {
        post: `if (noodle.run.get("next") !== 7 || noodle.request.params.get("id") !== "7") throw Error("propagation")`,
      },
    }
    await writeFile(
      join(dir, "folder", "first.yml"),
      lang.serializeRequest(first),
    )
    await writeFile(
      join(dir, "folder", "second.yml"),
      lang.serializeRequest(second),
    )
    const collection = await collectionRun(dir, undefined, undefined, true)
    expect(collection.results.map((result) => result.ok)).toEqual([false, true])
    expect(collection.results[0]?.failureCategories).toEqual([
      "http",
      "capture",
      "assertion",
    ])
    expect(
      (await requestRun("folder/second", dir, undefined, undefined, true))
        .result.failureCategories,
    ).toEqual(["execution"])
    expect(
      (
        await collectionRun(
          dir,
          undefined,
          undefined,
          true,
          undefined,
          false,
          [],
          [],
          [],
          true,
        )
      ).skipped,
    ).toHaveLength(1)
    const failing: Request = {
      ...first,
      scripts: {
        post: `console.log("private log"); throw Error("post failure")`,
      },
    }
    await writeFile(
      join(dir, "folder", "first.yml"),
      lang.serializeRequest(failing),
    )
    const individual = await requestRun(
      "folder/first",
      dir,
      undefined,
      undefined,
      true,
    )
    expect(individual.failed).toBe(true)
    expect(individual.result.failureCategories).toEqual([
      "script",
      "http",
      "capture",
      "assertion",
    ])
    const human = formatRequestRun(individual)
    expect(human).toContain("Post-script: failed")
    expect(human).not.toContain("private log")
  })
})
