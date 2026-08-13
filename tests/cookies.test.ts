import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { CollectionCookieJar, parseResponseCookies } from "../src/cookies"
import { setSecretBackendForTests, type SecretBackend } from "../src/secrets"

function memoryBackend(): SecretBackend & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get({ service, name }) {
      return values.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value, allowUnrestrictedAccess }) {
      expect(allowUnrestrictedAccess).toBe(false)
      values.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      return values.delete(`${service}:${name}`)
    },
  }
}

const configDirPromise = mkdtemp(join(tmpdir(), "noodle-cookies-"))

describe("CollectionCookieJar", () => {
  let configDir: string
  let backend: ReturnType<typeof memoryBackend>

  beforeEach(async () => {
    configDir = await configDirPromise
    backend = memoryBackend()
    setSecretBackendForTests(backend)
  })

  afterEach(async () => {
    setSecretBackendForTests(undefined)
    await rm(configDir, { recursive: true, force: true })
  })

  it("stores Set-Cookie headers and builds Cookie headers", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/login",
      new Headers({ "set-cookie": "session=abc; Path=/; HttpOnly" }),
    )
    expect(jar.cookieHeaderFor("https://example.com/")).toBe("session=abc")
    expect(jar.cookieHeaderFor("https://other.com/")).toBe("")
  })

  it("replaces same-name cookies and respects expiry", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers([
        ["set-cookie", "a=1; Path=/"],
        ["set-cookie", "b=2; Path=/; Max-Age=0"],
        ["set-cookie", "c=3; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT"],
      ]),
    )
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers({ "set-cookie": "a=new; Path=/" }),
    )
    const header = jar.cookieHeaderFor("https://example.com/")
    expect(header).toContain("a=new")
    expect(header).not.toContain("b=")
    expect(header).not.toContain("c=")
    expect(
      jar
        .list()
        .map((c) => c.name)
        .sort(),
    ).toEqual(["a"])
  })

  it("persists across opens and encrypts at rest", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers({ "set-cookie": "session=secret; Path=/" }),
    )
    await jar.saveNow()
    const file = join(configDir, "cookies", "col-1.json")
    const raw = await readFile(file, "utf8")
    expect(raw).not.toContain("secret")
    expect(raw).toContain("enc:v1:")

    const reopened = await CollectionCookieJar.open(configDir, "col-1")
    expect(reopened.cookieHeaderFor("https://example.com/")).toBe(
      "session=secret",
    )
  })

  it("does not replace an encrypted jar when its vault key is unavailable", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.put({ name: "session", value: "secret", domain: "example.com" })
    await jar.saveNow()
    const file = join(configDir, "cookies", "col-1.json")
    const encrypted = await readFile(file, "utf8")
    setSecretBackendForTests({
      async get() {
        throw new Error("no keyring")
      },
      async set() {
        throw new Error("no keyring")
      },
      async delete() {
        return false
      },
    })

    await expect(CollectionCookieJar.open(configDir, "col-1")).rejects.toThrow(
      "cookie jar encryption key is unavailable",
    )
    expect(await readFile(file, "utf8")).toBe(encrypted)
  })

  it("deletes cookies and domains", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers([
        ["set-cookie", "a=1; Path=/"],
        ["set-cookie", "b=2; Path=/; Domain=example.com"],
      ]),
    )
    await jar.deleteCookie("example.com", "/", "a")
    expect(jar.list().map((c) => c.name)).toEqual(["b"])
    await jar.deleteDomain("example.com")
    expect(jar.list()).toEqual([])
  })

  it("falls back to plaintext when the vault is unavailable", async () => {
    backend.values.clear()
    backend.values.set("blocked", "1")
    const failing: SecretBackend = {
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
    setSecretBackendForTests(failing)
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers({ "set-cookie": "a=1; Path=/" }),
    )
    await jar.saveNow()
    const raw = await readFile(join(configDir, "cookies", "col-1.json"), "utf8")
    expect(raw.startsWith("plain:")).toBe(true)

    const reopened = await CollectionCookieJar.open(configDir, "col-1")
    expect(reopened.cookieHeaderFor("https://example.com/")).toBe("a=1")
  })

  it("adds and replaces cookies via put()", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.put({
      name: "session",
      value: "token123",
      domain: "example.com",
      path: "/",
      httpOnly: true,
      secure: true,
    })
    expect(jar.cookieHeaderFor("https://example.com/")).toBe("session=token123")
    const stored = jar.list()[0]!
    expect(stored.httpOnly).toBe(true)
    expect(stored.secure).toBe(true)

    jar.put({
      name: "session",
      value: "token456",
      domain: "example.com",
      path: "/",
    })
    expect(jar.cookieHeaderFor("https://example.com/")).toBe("session=token456")
    expect(jar.list()).toHaveLength(1)
  })

  it("preserves host-only scope when editing a captured cookie", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/login",
      new Headers({ "set-cookie": "session=one; Path=/" }),
    )
    const captured = jar.list()[0]!
    expect(captured.hostOnly).toBe(true)

    jar.put({ ...captured, value: "two" })

    expect(jar.cookieHeaderFor("https://example.com/")).toBe("session=two")
    expect(jar.cookieHeaderFor("https://sub.example.com/")).toBe("")
  })

  it("rejects put() without a name or domain", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    expect(() =>
      jar.put({ name: "", value: "x", domain: "example.com" }),
    ).toThrow("cookie name is required")
    expect(() => jar.put({ name: "a", value: "x", domain: " " })).toThrow(
      "cookie domain is required",
    )
  })

  it("parses response cookies from Set-Cookie headers", async () => {
    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers([
        ["set-cookie", "a=1; Path=/; Secure; HttpOnly"],
        ["set-cookie", "b=2; Path=/admin; Max-Age=3600"],
      ]),
    )
    expect(jar.cookieHeaderFor("https://example.com/")).toBe("a=1")
    expect(jar.cookieHeaderFor("https://example.com/admin")).toContain("b=2")
  })

  it("reports Max-Age expiry for response and stored cookies", async () => {
    const before = Date.now() + 3_500_000
    const headers = new Headers({
      "set-cookie": "session=abc; Path=/; Max-Age=3600",
    })
    const responseExpiry = Date.parse(
      parseResponseCookies(headers)[0]!.expires!,
    )
    expect(responseExpiry).toBeGreaterThanOrEqual(before)
    expect(responseExpiry).toBeLessThanOrEqual(Date.now() + 3_700_000)

    const jar = await CollectionCookieJar.open(configDir, "col-1")
    jar.storeResponseCookies("https://example.com/", headers)
    const storedExpiry = jar.list()[0]!.expires?.getTime()
    expect(storedExpiry).toBeGreaterThanOrEqual(before)
    expect(storedExpiry).toBeLessThanOrEqual(Date.now() + 3_700_000)
  })
})
