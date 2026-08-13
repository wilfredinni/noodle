import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Request } from "../../src/schema"
import { send } from "../../src/requests/send"
import { CollectionCookieJar } from "../../src/cookies"
import { setSecretBackendForTests, type SecretBackend } from "../../src/secrets"

function memoryBackend(): SecretBackend & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
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

const baseReq: Request = {
  id: "req",
  name: "req",
  method: "GET",
  url: "",
  timeout: 30000,
  headers: {},
  params: [],
}

let server: ReturnType<typeof Bun.serve>
let port = 0
let seenCookies: string[] = []
let configDir = ""

beforeAll(async () => {
  configDir = await mkdtemp(join(tmpdir(), "noodle-send-cookies-"))
  setSecretBackendForTests(memoryBackend())
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      seenCookies.push(request.headers.get("cookie") ?? "")
      const path = new URL(request.url).pathname
      if (path === "/login") {
        return new Response("ok", {
          headers: [
            ["set-cookie", "session=abc123; Path=/; HttpOnly"],
            ["set-cookie", `scoped=yes; Path=/admin`],
          ],
        })
      }
      if (path === "/redirect") {
        return new Response(null, {
          status: 302,
          headers: { location: "/done" },
        })
      }
      if (path === "/set-other") {
        return new Response("ok", {
          headers: [["set-cookie", "other=x; Path=/; Domain=localhost"]],
        })
      }
      return new Response("done")
    },
  })
  port = server.port!
})

afterAll(async () => {
  setSecretBackendForTests(undefined)
  server.stop(true)
  await rm(configDir, { recursive: true, force: true })
})

describe("send with cookie jar", () => {
  it("captures Set-Cookie and sends jar cookies on the next request", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    const login: Request = {
      ...baseReq,
      url: `http://localhost:${port}/login`,
    }
    const loginResponse = await send(login, { cookies: jar })
    expect(loginResponse.cookies).toEqual([
      expect.objectContaining({ name: "session", value: "abc123" }),
      expect.objectContaining({ name: "scoped", value: "yes" }),
    ])
    const check: Request = {
      ...baseReq,
      url: `http://localhost:${port}/admin/users`,
    }
    const checkResponse = await send(check, { cookies: jar })
    expect(seenCookies).toContain("scoped=yes; session=abc123")
    expect(seenCookies).not.toContain("other=x")
    expect(checkResponse.sentCookies).toEqual([
      { name: "scoped", value: "yes" },
      { name: "session", value: "abc123" },
    ])
  })

  it("captures cookies across redirects and keeps user Cookie header precedence", async () => {
    seenCookies = []
    const jar = await CollectionCookieJar.open(configDir, "col-2")
    const req: Request = {
      ...baseReq,
      url: `http://localhost:${port}/redirect`,
      headers: { Cookie: { enabled: true, value: "session=userwin" } },
    }
    const response = await send(req, { cookies: jar })
    expect(seenCookies).toEqual(["session=userwin", "session=userwin"])
    expect(response.sentCookies).toEqual([
      { name: "session", value: "userwin" },
    ])
  })

  it("does not send cookies without an explicit jar option", async () => {
    seenCookies = []
    const check: Request = {
      ...baseReq,
      url: `http://localhost:${port}/admin/users`,
    }
    await send(check)
    expect(seenCookies).toEqual([""])
  })

  it("respects sendCookies=false on the request", async () => {
    seenCookies = []
    const jar = await CollectionCookieJar.open(configDir, "col-send-toggle")
    jar.put({ name: "session", value: "manual", domain: "localhost" })
    const disabled: Request = {
      ...baseReq,
      url: `http://localhost:${port}/admin/users`,
      sendCookies: false,
    }
    await send(disabled, { cookies: jar })
    expect(seenCookies).toEqual([""])
    const enabled: Request = {
      ...baseReq,
      url: `http://localhost:${port}/admin/users`,
    }
    await send(enabled, { cookies: jar })
    expect(seenCookies).toContain("session=manual")
  })

  it("captures response cookies when sendCookies=false", async () => {
    seenCookies = []
    const jar = await CollectionCookieJar.open(configDir, "col-capture-toggle")
    await send(
      {
        ...baseReq,
        url: `http://localhost:${port}/login`,
        sendCookies: false,
      },
      { cookies: jar },
    )

    expect(seenCookies).toEqual([""])
    await send(
      {
        ...baseReq,
        url: `http://localhost:${port}/admin/users`,
      },
      { cookies: jar },
    )
    expect(seenCookies[1]).toContain("session=abc123")
  })

  it("refreshes cookies committed by another handle before sending", async () => {
    seenCookies = []
    const writer = await CollectionCookieJar.open(configDir, "shared-refresh")
    const reader = await CollectionCookieJar.open(configDir, "shared-refresh")
    writer.put({ name: "fresh", value: "yes", domain: "localhost" })
    await writer.saveNow()

    await send(
      {
        ...baseReq,
        url: `http://localhost:${port}/admin/users`,
      },
      { cookies: reader },
    )

    expect(seenCookies).toEqual(["fresh=yes"])
  })
})
