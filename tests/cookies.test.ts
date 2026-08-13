import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  CollectionCookieJar,
  flushAll,
  parseResponseCookies,
  setCookieJarTimingForTests,
} from "../src/cookies"
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
    await flushAll().catch(() => {})
    setCookieJarTimingForTests()
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

    const unavailable = await CollectionCookieJar.open(configDir, "col-1")
    expect(unavailable.status.state).toBe("unavailable")
    expect(unavailable.cookieHeaderFor("https://example.com/")).toBe("")
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

  it("reports zero Max-Age expiry for a non-empty response cookie", () => {
    const headers = new Headers({
      "set-cookie": "session=revoke; Path=/; Max-Age=0",
    })

    expect(parseResponseCookies(headers)).toEqual([
      expect.objectContaining({
        name: "session",
        value: "revoke",
        expires: "1970-01-01T00:00:00.000Z",
      }),
    ])
  })

  it("merges mutations from independently opened handles", async () => {
    const first = await CollectionCookieJar.open(configDir, "shared")
    const second = await CollectionCookieJar.open(configDir, "shared")
    first.put({ name: "first", value: "1", domain: "example.com" })
    second.put({ name: "second", value: "2", domain: "example.com" })

    await Promise.all([first.saveNow(), second.saveNow()])

    const reopened = await CollectionCookieJar.open(configDir, "shared")
    expect(
      reopened
        .list()
        .map((cookie) => cookie.name)
        .sort(),
    ).toEqual(["first", "second"])
  })

  it("replays concurrent deletes against the latest committed state", async () => {
    const initial = await CollectionCookieJar.open(configDir, "shared")
    initial.put({ name: "old", value: "1", domain: "example.com" })
    await initial.saveNow()
    const deleting = await CollectionCookieJar.open(configDir, "shared")
    const adding = await CollectionCookieJar.open(configDir, "shared")

    await deleting.deleteCookie("example.com", "/", "old")
    adding.put({ name: "new", value: "2", domain: "example.com" })
    await Promise.all([deleting.saveNow(), adding.saveNow()])

    const reopened = await CollectionCookieJar.open(configDir, "shared")
    expect(reopened.list().map((cookie) => cookie.name)).toEqual(["new"])
  })

  it("orders clear and set operations by lock commit order", async () => {
    const setting = await CollectionCookieJar.open(configDir, "shared")
    const clearing = await CollectionCookieJar.open(configDir, "shared")
    setting.put({ name: "first", value: "1", domain: "example.com" })
    await clearing.clear()

    await setting.saveNow()
    await clearing.saveNow()
    let reopened = await CollectionCookieJar.open(configDir, "shared")
    expect(reopened.list()).toEqual([])

    setting.put({ name: "second", value: "2", domain: "example.com" })
    await setting.saveNow()
    reopened = await CollectionCookieJar.open(configDir, "shared")
    expect(reopened.list().map((cookie) => cookie.name)).toEqual(["second"])
  })

  it("serializes overlapping saves from one handle", async () => {
    const jar = await CollectionCookieJar.open(configDir, "shared")
    jar.put({ name: "first", value: "1", domain: "example.com" })
    const firstSave = jar.saveNow()
    jar.put({ name: "second", value: "2", domain: "example.com" })
    await Promise.all([firstSave, jar.saveNow()])

    const reopened = await CollectionCookieJar.open(configDir, "shared")
    expect(
      reopened
        .list()
        .map((cookie) => cookie.name)
        .sort(),
    ).toEqual(["first", "second"])
  })

  it("creates one encryption key across concurrent first saves", async () => {
    let sets = 0
    const values = new Map<string, string>()
    setSecretBackendForTests({
      async get({ service, name }) {
        return values.get(`${service}:${name}`) ?? null
      },
      async set({ service, name, value }) {
        sets += 1
        values.set(`${service}:${name}`, value)
      },
      async delete() {
        return false
      },
    })
    const first = await CollectionCookieJar.open(configDir, "shared")
    const second = await CollectionCookieJar.open(configDir, "shared")
    first.put({ name: "first", value: "1", domain: "example.com" })
    second.put({ name: "second", value: "2", domain: "example.com" })

    await Promise.all([first.saveNow(), second.saveNow()])

    expect(sets).toBe(1)
  })

  it("times out on an active lock and retries retained mutations", async () => {
    setCookieJarTimingForTests({
      lockTimeoutMs: 20,
      minBackoffMs: 1,
      maxBackoffMs: 2,
    })
    const jar = await CollectionCookieJar.open(configDir, "locked")
    jar.put({ name: "pending", value: "1", domain: "example.com" })
    const lockDir = `${jar.file}.lock`
    await mkdir(lockDir, { recursive: true })

    await expect(jar.saveNow()).rejects.toMatchObject({
      code: "lock-timeout",
    })
    await rm(lockDir, { recursive: true })
    await jar.saveNow()

    const reopened = await CollectionCookieJar.open(configDir, "locked")
    expect(reopened.list().map((cookie) => cookie.name)).toEqual(["pending"])
  })

  it("recovers a stale lock without leaving shared temporary files", async () => {
    setCookieJarTimingForTests({ staleLockMs: 10 })
    const jar = await CollectionCookieJar.open(configDir, "stale")
    jar.put({ name: "saved", value: "1", domain: "example.com" })
    const lockDir = `${jar.file}.lock`
    await mkdir(lockDir, { recursive: true })
    await writeFile(join(lockDir, "owner"), "abandoned")
    const old = new Date(Date.now() - 1000)
    await utimes(lockDir, old, old)

    await jar.saveNow()

    const entries = await readdir(join(configDir, "cookies"))
    expect(entries.some((entry) => entry.includes(".lock"))).toBe(false)
    expect(entries.some((entry) => entry.includes(".tmp-"))).toBe(false)
  })

  it("preserves malformed and unknown storage until explicit reset", async () => {
    const cookiesDir = join(configDir, "cookies")
    const file = join(cookiesDir, "broken.json")
    await mkdir(cookiesDir, { recursive: true })
    await writeFile(file, "plain:{not-json", "utf8")
    const jar = await CollectionCookieJar.open(configDir, "broken")
    expect(jar.status).toMatchObject({
      state: "unavailable",
      error: { code: "malformed" },
    })
    jar.put({ name: "pending", value: "1", domain: "example.com" })

    await expect(jar.saveNow()).rejects.toMatchObject({ code: "malformed" })
    expect(await readFile(file, "utf8")).toBe("plain:{not-json")
    const reset = await jar.reset()

    expect(reset.backupPath).toBeDefined()
    expect(await readFile(reset.backupPath!, "utf8")).toBe("plain:{not-json")
    expect(jar.status.state).toBe("encrypted")
    expect(jar.list().map((cookie) => cookie.name)).toEqual(["pending"])

    await writeFile(file, "future:v2:anything", "utf8")
    const unknown = await CollectionCookieJar.open(configDir, "broken")
    expect(unknown.status).toMatchObject({
      state: "unavailable",
      error: { code: "unknown-format" },
    })
    expect(await readFile(file, "utf8")).toBe("future:v2:anything")
  })

  it("reports bad ciphertext without modifying it", async () => {
    backend.values.set(
      "dev.noodlerest.noodle:app:settings:cookie-jar-key",
      Buffer.alloc(32, 7).toString("hex"),
    )
    const file = join(configDir, "cookies", "bad.json")
    await mkdir(join(configDir, "cookies"), { recursive: true })
    await writeFile(file, "enc:v1:00:00:not-ciphertext", "utf8")

    const jar = await CollectionCookieJar.open(configDir, "bad")

    expect(jar.status).toMatchObject({
      state: "unavailable",
      error: { code: "decrypt" },
    })
    expect(await readFile(file, "utf8")).toBe("enc:v1:00:00:not-ciphertext")
  })

  it("treats non-ENOENT read failures as unavailable storage", async () => {
    const file = join(configDir, "cookies", "unreadable.json")
    await mkdir(file, { recursive: true })

    const jar = await CollectionCookieJar.open(configDir, "unreadable")

    expect(jar.status).toMatchObject({
      state: "unavailable",
      error: { code: "read" },
    })
    expect((await stat(file)).isDirectory()).toBe(true)
  })

  it("marks plaintext storage and restricts its file permissions", async () => {
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
    const jar = await CollectionCookieJar.open(configDir, "plain")
    jar.put({ name: "saved", value: "1", domain: "example.com" })
    await jar.saveNow()

    expect(jar.status.state).toBe("plaintext-warning")
    expect((await stat(jar.file)).mode & 0o777).toBe(0o600)
    expect(jar.warnings).toHaveLength(1)
  })

  it("strictly validates manual domains, paths, and cookie prefixes", async () => {
    const jar = await CollectionCookieJar.open(configDir, "validation")
    let changes = 0
    jar.subscribe(() => {
      changes += 1
    })
    expect(() => jar.put({ name: "a", value: "1", domain: "com" })).toThrow(
      "domain or attributes",
    )
    expect(() =>
      jar.put({ name: "a", value: "1", domain: "example.com", path: "x" }),
    ).toThrow("path must start")
    expect(() =>
      jar.put({ name: "a", value: "not;valid", domain: "example.com" }),
    ).toThrow("invalid name or value")
    expect(() =>
      jar.put({ name: "__Secure-a", value: "1", domain: "example.com" }),
    ).toThrow("must be Secure")
    expect(() =>
      jar.put({
        name: "__Host-a",
        value: "1",
        domain: "example.com",
        secure: true,
        hostOnly: false,
      }),
    ).toThrow("host-only")
    expect(jar.list()).toEqual([])
    expect(changes).toBe(0)
  })

  it("ignores invalid server cookies without publishing a mutation", async () => {
    const jar = await CollectionCookieJar.open(configDir, "server-validation")
    let changes = 0
    jar.subscribe(() => {
      changes += 1
    })

    jar.storeResponseCookies(
      "https://example.com/",
      new Headers({ "set-cookie": "invalid-cookie-without-equals" }),
    )

    expect(jar.list()).toEqual([])
    expect(changes).toBe(0)
  })

  it("refreshes concurrent commits before the next request", async () => {
    const first = await CollectionCookieJar.open(configDir, "shared")
    const second = await CollectionCookieJar.open(configDir, "shared")
    first.put({ name: "fresh", value: "1", domain: "example.com" })
    await first.saveNow()

    expect(second.cookieHeaderFor("https://example.com/")).toBe("")
    await second.refresh()
    expect(second.cookieHeaderFor("https://example.com/")).toBe("fresh=1")
  })

  it("flushes all active handles", async () => {
    const first = await CollectionCookieJar.open(configDir, "first")
    const second = await CollectionCookieJar.open(configDir, "second")
    first.put({ name: "a", value: "1", domain: "example.com" })
    second.put({ name: "b", value: "2", domain: "example.com" })

    await flushAll()

    expect(
      (await CollectionCookieJar.open(configDir, "first")).list()[0]?.name,
    ).toBe("a")
    expect(
      (await CollectionCookieJar.open(configDir, "second")).list()[0]?.name,
    ).toBe("b")
  })
})
