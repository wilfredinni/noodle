import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs/promises"
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
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import {
  CollectionCookieJar,
  flushAll,
  parseResponseCookies,
  setCookieJarStorageForTests,
  setCookieJarTimingForTests,
} from "../src/cookies"
import { setSecretBackendForTests, type SecretBackend } from "../src/secrets"
import { acquireFileLock } from "../src/fileLock"

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
    setCookieJarStorageForTests({
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
  })

  afterEach(async () => {
    await flushAll().catch(() => {})
    setCookieJarTimingForTests()
    setCookieJarStorageForTests()
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

  it("isolates cookie data with the test storage override and resets it", async () => {
    const isolated = join(configDir, "isolated")
    setCookieJarStorageForTests({
      configDir: isolated,
      keyLockFile: join(isolated, "cookie-jar-key"),
    })
    const jar = await CollectionCookieJar.open(configDir, "isolated")
    expect(jar.file).toBe(join(isolated, "cookies", "isolated.json"))
    jar.put({ name: "session", value: "secret", domain: "example.com" })
    await jar.close()
    expect(await readFile(jar.file, "utf8")).toContain("enc:v1:")
    expect(
      await Bun.file(join(configDir, "cookies", "isolated.json")).exists(),
    ).toBe(false)
    setCookieJarStorageForTests({
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    const restored = await CollectionCookieJar.open(configDir, "restored")
    expect(restored.file).toBe(join(configDir, "cookies", "restored.json"))
    await restored.close()
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
    unavailable.put({ name: "pending", value: "1", domain: "example.com" })
    await expect(unavailable.saveNow()).rejects.toMatchObject({
      code: "key-unavailable",
    })
    expect(await readFile(file, "utf8")).toBe(encrypted)
    setSecretBackendForTests(backend)
    await unavailable.saveNow()
    expect(unavailable.cookieHeaderFor("https://example.com/")).toBe(
      "session=secret; pending=1",
    )
    await unavailable.close()
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
    setCookieJarStorageForTests({
      platform: "linux",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
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

  it("preserves Max-Age expiry when replaying response mutations", async () => {
    const jar = await CollectionCookieJar.open(configDir, "max-age-replay")
    jar.storeResponseCookies(
      "https://example.com/",
      new Headers({ "set-cookie": "session=abc; Path=/; Max-Age=3600" }),
    )
    const initialExpiry = jar.list()[0]!.expires?.getTime()

    await new Promise((resolve) => setTimeout(resolve, 20))
    await jar.saveNow()

    const reopened = await CollectionCookieJar.open(configDir, "max-age-replay")
    expect(reopened.list()[0]!.expires?.getTime()).toBe(initialExpiry)
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

  it("preserves an aged active lock and retries retained mutations", async () => {
    setCookieJarTimingForTests({
      lockTimeoutMs: 20,
      minBackoffMs: 1,
      maxBackoffMs: 2,
    })
    const jar = await CollectionCookieJar.open(configDir, "locked")
    jar.put({ name: "existing", value: "1", domain: "example.com" })
    await jar.saveNow()
    jar.put({ name: "pending", value: "1", domain: "example.com" })
    const lockDir = `${jar.file}.lock`
    const holder = await acquireFileLock(jar.file, {
      lockTimeoutMs: 20,
      minBackoffMs: 1,
      maxBackoffMs: 2,
    })
    const owner = await readFile(join(lockDir, "owner"), "utf8")
    const stored = await readFile(jar.file, "utf8")
    const old = new Date(Date.now() - 60_000)
    await utimes(lockDir, old, old)

    try {
      await expect(jar.saveNow()).rejects.toMatchObject({
        code: "lock-timeout",
      })
      expect(await readFile(join(lockDir, "owner"), "utf8")).toBe(owner)
      expect(await readFile(jar.file, "utf8")).toBe(stored)
    } finally {
      await holder.release()
    }
    await jar.saveNow()

    const reopened = await CollectionCookieJar.open(configDir, "locked")
    expect(reopened.list().map((cookie) => cookie.name)).toEqual([
      "existing",
      "pending",
    ])
  })

  it("unregisters a closed handle when its final save fails", async () => {
    setCookieJarTimingForTests({
      lockTimeoutMs: 5,
      minBackoffMs: 1,
      maxBackoffMs: 1,
    })
    const jar = await CollectionCookieJar.open(configDir, "close-failure")
    jar.put({ name: "pending", value: "1", domain: "example.com" })
    const lockDir = `${jar.file}.lock`
    await mkdir(lockDir, { recursive: true })

    await expect(jar.close()).rejects.toMatchObject({ code: "lock-timeout" })
    await expect(flushAll()).resolves.toBeUndefined()

    await rm(lockDir, { recursive: true, force: true })
  })

  it("requires explicit abandoned-lock recovery and retains pending writes", async () => {
    setCookieJarTimingForTests({
      lockTimeoutMs: 20,
      minBackoffMs: 1,
      maxBackoffMs: 2,
    })
    const jar = await CollectionCookieJar.open(configDir, "stale")
    jar.put({ name: "saved", value: "1", domain: "example.com" })
    const lockDir = `${jar.file}.lock`
    await mkdir(lockDir, { recursive: true })
    await writeFile(join(lockDir, "owner"), "abandoned")
    const old = new Date(Date.now() - 60_000)
    await utimes(lockDir, old, old)

    await expect(jar.saveNow()).rejects.toMatchObject({
      code: "lock-timeout",
      message: expect.stringContaining(lockDir),
    })
    expect(await readFile(join(lockDir, "owner"), "utf8")).toBe("abandoned")
    await expect(stat(jar.file)).rejects.toMatchObject({ code: "ENOENT" })

    await rm(lockDir, { recursive: true })
    await jar.saveNow()
    const reopened = await CollectionCookieJar.open(configDir, "stale")
    expect(reopened.list().map((cookie) => cookie.name)).toEqual(["saved"])

    const entries = await readdir(join(configDir, "cookies"))
    expect(entries.some((entry) => entry.includes(".lock"))).toBe(false)
    expect(entries.some((entry) => entry.includes(".tmp-"))).toBe(false)
  })

  it("preserves malformed and unknown storage until explicit reset", async () => {
    setCookieJarStorageForTests({
      platform: "linux",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
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
    setCookieJarStorageForTests({
      platform: "linux",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
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
    if (process.platform !== "win32") {
      expect((await stat(jar.file)).mode & 0o777).toBe(0o600)
    }
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

  it("marks refresh lock failures unavailable and recovers on retry", async () => {
    setCookieJarTimingForTests({ lockTimeoutMs: 0 })
    const jar = await CollectionCookieJar.open(configDir, "refresh-lock")
    jar.put({ name: "session", value: "saved", domain: "example.com" })
    await jar.saveNow()
    const holder = await acquireFileLock(jar.file, {
      lockTimeoutMs: 0,
      minBackoffMs: 0,
      maxBackoffMs: 0,
    })
    const stored = await readFile(jar.file, "utf8")

    try {
      await expect(jar.refresh()).rejects.toMatchObject({
        code: "lock-timeout",
      })
      expect(jar.status).toMatchObject({
        state: "unavailable",
        error: { code: "lock-timeout" },
      })
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("")
      expect(await readFile(jar.file, "utf8")).toBe(stored)

      setCookieJarTimingForTests()
      const wait = spyOn(globalThis, "setTimeout").mockImplementation(
        Object.assign(
          () => {
            throw new Error(
              "Unavailable cookie storage must not wait for a lock",
            )
          },
          { __promisify__: setTimeout.__promisify__ },
        ),
      )
      try {
        await expect(jar.refresh()).rejects.toMatchObject({
          code: "lock-timeout",
        })
        expect(wait).not.toHaveBeenCalled()
      } finally {
        wait.mockRestore()
      }

      await holder.release()
      await jar.refresh()
      expect(jar.status.state).toBe("encrypted")
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("session=saved")
    } finally {
      await holder.release()
      await jar.close()
    }
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

  it("requires a vault key before opening a new Windows jar and retains manual edits", async () => {
    setCookieJarStorageForTests({
      platform: "win32",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    setSecretBackendForTests({
      async get() {
        throw new Error("vault unavailable")
      },
      async set() {
        throw new Error("vault unavailable")
      },
      async delete() {
        return false
      },
    })
    const jar = await CollectionCookieJar.open(configDir, "windows-unavailable")
    try {
      expect(jar.status).toMatchObject({
        state: "unavailable",
        error: { code: "key-unavailable" },
      })
      expect(jar.warnings).toHaveLength(1)
      expect(
        jar.scriptTransaction("https://example.com/", () => {}),
      ).toBeUndefined()
      jar.storeResponseCookies(
        "https://example.com/",
        new Headers({ "set-cookie": "received=ignored; Path=/" }),
      )
      jar.put({ name: "pending", value: "1", domain: "example.com" })
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("")
      await expect(jar.saveNow()).rejects.toMatchObject({
        code: "key-unavailable",
      })
      await expect(jar.reset()).rejects.toMatchObject({
        code: "key-unavailable",
      })
      expect(await readdir(join(configDir, "cookies"))).toEqual([])

      setSecretBackendForTests(backend)
      await jar.refresh()
      await jar.saveNow()
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("pending=1")
      expect((await readFile(jar.file, "utf8")).startsWith("enc:v1:")).toBe(
        true,
      )
    } finally {
      await jar.close().catch(() => {})
    }
  })

  it("does not back up Windows storage when storing a vault key fails", async () => {
    setCookieJarStorageForTests({
      platform: "win32",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    const file = join(configDir, "cookies", "windows-key-write.json")
    await mkdir(join(configDir, "cookies"), { recursive: true })
    const original = "plain:{existing storage}"
    await writeFile(file, original)
    setSecretBackendForTests({
      async get() {
        return null
      },
      async set() {
        throw new Error("vault cannot write")
      },
      async delete() {
        return false
      },
    })
    const jar = await CollectionCookieJar.open(configDir, "windows-key-write")
    try {
      jar.put({ name: "pending", value: "1", domain: "example.com" })
      await expect(jar.reset()).rejects.toMatchObject({
        code: "key-unavailable",
      })
      expect(await readFile(file, "utf8")).toBe(original)
      expect(await readdir(join(configDir, "cookies"))).toEqual([
        "windows-key-write.json",
      ])
      setSecretBackendForTests(backend)
      const reset = await jar.reset()
      expect(await readFile(reset.backupPath!, "utf8")).toBe(original)
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("pending=1")
      expect((await readFile(file, "utf8")).startsWith("enc:v1:")).toBe(true)
    } finally {
      await jar.close().catch(() => {})
    }
  })

  it("refuses to load or overwrite plaintext on Windows until an explicit reset", async () => {
    setCookieJarStorageForTests({
      platform: "linux",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    const plaintextBackend = {
      async get() {
        throw new Error("no vault")
      },
      async set() {
        throw new Error("no vault")
      },
      async delete() {
        return false
      },
    }
    setSecretBackendForTests(plaintextBackend)
    const unixJar = await CollectionCookieJar.open(configDir, "windows-plain")
    unixJar.put({ name: "original", value: "secret", domain: "example.com" })
    await unixJar.close()
    const original = await readFile(unixJar.file, "utf8")

    setCookieJarStorageForTests({
      platform: "win32",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    setSecretBackendForTests(backend)
    const jar = await CollectionCookieJar.open(configDir, "windows-plain")
    try {
      expect(jar.status).toMatchObject({
        state: "unavailable",
        error: { code: "read" },
      })
      expect(jar.list()).toEqual([])
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("")
      jar.put({ name: "pending", value: "1", domain: "example.com" })
      await expect(jar.saveNow()).rejects.toMatchObject({ code: "read" })
      expect(await readFile(jar.file, "utf8")).toBe(original)
      const reset = await jar.reset()
      expect(await readFile(reset.backupPath!, "utf8")).toBe(original)
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("pending=1")
      expect((await readFile(jar.file, "utf8")).startsWith("enc:v1:")).toBe(
        true,
      )
    } finally {
      await jar.close().catch(() => {})
    }
  })

  for (const [description, stored] of [
    ["empty", ""],
    ["short", "00"],
    ["trailing junk", `${"ab".repeat(32)}junk`],
    ["non-hex", "gg".repeat(32)],
  ]) {
    it(`does not replace a ${description} vault key or reset its jar`, async () => {
      setCookieJarStorageForTests({
        platform: "win32",
        keyLockFile: join(configDir, "cookie-jar-key"),
      })
      const account = "dev.noodlerest.noodle:app:settings:cookie-jar-key"
      backend.values.set(account, stored!)
      const file = join(configDir, "cookies", "invalid-key.json")
      await mkdir(join(configDir, "cookies"), { recursive: true })
      const original = "enc:v1:preserved encrypted storage"
      await writeFile(file, original)
      const jar = await CollectionCookieJar.open(configDir, "invalid-key")
      try {
        expect(jar.status).toMatchObject({
          state: "unavailable",
          error: { code: "key-unavailable" },
        })
        jar.put({ name: "pending", value: "1", domain: "example.com" })
        await expect(jar.saveNow()).rejects.toMatchObject({
          code: "key-unavailable",
        })
        await expect(jar.reset()).rejects.toMatchObject({
          code: "key-unavailable",
        })
        expect(backend.values.get(account)).toBe(stored)
        expect(await readFile(file, "utf8")).toBe(original)
        expect(await readdir(join(configDir, "cookies"))).toEqual([
          "invalid-key.json",
        ])
      } finally {
        await jar.close().catch(() => {})
      }
    })
  }

  it("retains encrypted storage and pending edits after write and reset publication failures", async () => {
    setCookieJarStorageForTests({
      platform: "win32",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    const jar = await CollectionCookieJar.open(configDir, "windows-write")
    jar.put({ name: "original", value: "1", domain: "example.com" })
    await jar.saveNow()
    const original = await readFile(jar.file, "utf8")
    jar.put({ name: "pending", value: "2", domain: "example.com" })
    const realRename = fs.rename
    const failPublication = spyOn(fs, "rename").mockImplementation(
      async (from, to) => {
        if (String(from).startsWith(`${jar.file}.tmp-`)) {
          throw new Error("publication failed")
        }
        return realRename(from, to)
      },
    )
    try {
      await expect(jar.saveNow()).rejects.toMatchObject({ code: "write" })
      expect(await readFile(jar.file, "utf8")).toBe(original)
      await expect(jar.reset()).rejects.toMatchObject({ code: "write" })
      expect(await readFile(jar.file, "utf8")).toBe(original)
      expect(await readdir(join(configDir, "cookies"))).toEqual([
        "windows-write.json",
      ])
    } finally {
      failPublication.mockRestore()
    }
    try {
      await jar.saveNow()
      const reopened = await CollectionCookieJar.open(
        configDir,
        "windows-write",
      )
      expect(reopened.cookieHeaderFor("https://example.com/")).toBe(
        "original=1; pending=2",
      )
      await reopened.close()
    } finally {
      await jar.close().catch(() => {})
    }
  })

  it("creates one shared key for concurrent first jars in different config directories", async () => {
    setCookieJarStorageForTests({
      platform: "win32",
      keyLockFile: join(configDir, "cookie-jar-key"),
    })
    let writes = 0
    setSecretBackendForTests({
      async get(options) {
        const value = await backend.get(options)
        await Bun.sleep(25)
        return value
      },
      async set(options) {
        writes += 1
        await backend.set(options)
      },
      delete: backend.delete,
    })
    const dirs = [join(configDir, "first"), join(configDir, "second")]
    const jars = await Promise.all(
      dirs.map((dir) => CollectionCookieJar.open(dir, "new")),
    )
    try {
      expect(writes).toBe(1)
      for (const [index, jar] of jars.entries()) {
        expect(jar.status.state).toBe("encrypted")
        jar.put({ name: "session", value: `${index}`, domain: "example.com" })
      }
      await Promise.all(jars.map((jar) => jar.saveNow()))
      for (const [index, dir] of dirs.entries()) {
        const reopened = await CollectionCookieJar.open(dir, "new")
        expect(reopened.cookieHeaderFor("https://example.com/")).toBe(
          `session=${index}`,
        )
        await reopened.close()
      }
    } finally {
      await Promise.all(jars.map((jar) => jar.close().catch(() => {})))
    }
  })

  it("does not reclaim an aged shared key lock or silently fall back to plaintext", async () => {
    const keyLockFile = join(configDir, "cookie-jar-key")
    setCookieJarStorageForTests({ platform: "win32", keyLockFile })
    setCookieJarTimingForTests({
      lockTimeoutMs: 10,
      minBackoffMs: 1,
      maxBackoffMs: 1,
    })
    const lock = await acquireFileLock(keyLockFile, {
      lockTimeoutMs: 0,
      minBackoffMs: 0,
      maxBackoffMs: 0,
    })
    const owner = await readFile(join(`${keyLockFile}.lock`, "owner"), "utf8")
    const old = new Date(Date.now() - 60_000)
    await utimes(`${keyLockFile}.lock`, old, old)
    const jar = await CollectionCookieJar.open(configDir, "key-locked")
    try {
      expect(jar.status).toMatchObject({
        state: "unavailable",
        error: {
          code: "lock-timeout",
          message: expect.stringContaining(`${keyLockFile}.lock`),
        },
      })
      jar.put({ name: "pending", value: "1", domain: "example.com" })
      await expect(jar.saveNow()).rejects.toMatchObject({
        code: "lock-timeout",
      })
      const wait = spyOn(globalThis, "setTimeout").mockImplementation(
        Object.assign(
          () => {
            throw new Error(
              "Unavailable cookie storage must not wait for its key lock",
            )
          },
          { __promisify__: setTimeout.__promisify__ },
        ),
      )
      try {
        await expect(jar.refresh()).rejects.toMatchObject({
          code: "lock-timeout",
        })
        expect(wait).not.toHaveBeenCalled()
      } finally {
        wait.mockRestore()
      }
      expect(await readFile(join(`${keyLockFile}.lock`, "owner"), "utf8")).toBe(
        owner,
      )
      expect(await readdir(join(configDir, "cookies"))).toEqual([])
      await lock.release()
      await jar.saveNow()
      expect(jar.cookieHeaderFor("https://example.com/")).toBe("pending=1")
    } finally {
      await lock.release()
      await jar.close().catch(() => {})
    }
  })

  it("serializes first-key creation across processes with separate jar config directories", async () => {
    const shared = join(configDir, "process-vault")
    await mkdir(shared, { recursive: true })
    const vaultFile = join(shared, "key")
    const keyLockFile = join(shared, "cookie-jar-key")
    const startFile = join(shared, "start")
    const fixture = resolve(import.meta.dir, "fixtures/cookie-key-process.ts")
    const dirs = [
      join(configDir, "process-first"),
      join(configDir, "process-second"),
    ]
    const children = dirs.map((dir, index) =>
      Bun.spawn(
        [
          process.execPath,
          fixture,
          dir,
          vaultFile,
          keyLockFile,
          startFile,
          `${index}`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      ),
    )
    try {
      const deadline = Date.now() + 4000
      for (;;) {
        const entries = await readdir(shared)
        if (entries.includes("ready-0") && entries.includes("ready-1")) break
        if (Date.now() >= deadline)
          throw new Error("Cookie key fixtures did not start")
        await Bun.sleep(10)
      }
      await writeFile(startFile, "start")
      const results = await Promise.all(
        children.map(async (child) => ({
          code: await child.exited,
          stdout: await new Response(child.stdout).text(),
          stderr: await new Response(child.stderr).text(),
        })),
      )
      expect(results).toEqual([
        { code: 0, stdout: "", stderr: "" },
        { code: 0, stdout: "", stderr: "" },
      ])
      const entries = await readdir(shared)
      expect(
        entries.filter((entry) => entry.startsWith("stored-")),
      ).toHaveLength(1)
      backend.values.set(
        "dev.noodlerest.noodle:app:settings:cookie-jar-key",
        await readFile(vaultFile, "utf8"),
      )
      setCookieJarStorageForTests({ platform: "win32", keyLockFile })
      for (const [index, dir] of dirs.entries()) {
        const jar = await CollectionCookieJar.open(dir, "new")
        expect(jar.cookieHeaderFor("https://example.com/")).toBe(
          `session=${index}`,
        )
        await jar.close()
      }
    } finally {
      for (const child of children) child.kill()
      await Promise.all(children.map((child) => child.exited))
    }
  }, 15_000)
})
