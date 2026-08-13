import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto"
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import { Cookie, CookieJar, type SerializedCookieJar } from "tough-cookie"
import { getAppSettingSecret, setAppSettingSecret } from "../secrets"
import type { ResponseCookie } from "../schema"

export interface JarCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: Date | null
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
  sameSite?: "strict" | "lax" | "none"
}

export interface CookieInput {
  name: string
  value: string
  domain: string
  path?: string
  expires?: Date | null
  secure?: boolean
  httpOnly?: boolean
  hostOnly?: boolean
  sameSite?: "strict" | "lax" | "none"
}

export type CookieJarStorageErrorCode =
  | "read"
  | "unknown-format"
  | "malformed"
  | "key-unavailable"
  | "decrypt"
  | "lock-timeout"
  | "write"

export class CookieJarStorageError extends Error {
  readonly name = "CookieJarStorageError"

  constructor(
    readonly code: CookieJarStorageErrorCode,
    message: string,
    readonly file: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export class CookieValidationError extends Error {
  readonly name = "CookieValidationError"
}

export type CookieJarStatus =
  | { state: "disabled" }
  | { state: "loading" }
  | { state: "encrypted" }
  | { state: "plaintext-warning"; warning: string }
  | { state: "unavailable"; error: CookieJarStorageError }

export const COOKIE_PLAINTEXT_WARNING =
  "Cookie storage is plaintext because the credential vault is unavailable. The file is restricted to mode 0600."

export function cookieJarWarnings(status: CookieJarStatus): string[] {
  if (status.state === "plaintext-warning") return [status.warning]
  if (status.state === "unavailable") return [status.error.message]
  return []
}

function expiryDate(cookie: Cookie): Date | null {
  const expires = cookie.expiryTime()
  if (expires === undefined || expires === Infinity || Number.isNaN(expires)) {
    return null
  }
  if (expires === -Infinity) return new Date(0)
  return new Date(expires)
}

export function parseResponseCookies(headers: Headers): ResponseCookie[] {
  const out: ResponseCookie[] = []
  for (const setCookie of headers.getSetCookie()) {
    const cookie = Cookie.parse(setCookie, { loose: true })
    if (!cookie) continue
    out.push({
      name: cookie.key,
      value: cookie.value,
      ...(cookie.domain ? { domain: cookie.domain } : {}),
      ...(cookie.path ? { path: cookie.path } : {}),
      expires: expiryDate(cookie)?.toISOString() ?? null,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...(cookie.sameSite === "strict" ||
      cookie.sameSite === "lax" ||
      cookie.sameSite === "none"
        ? { sameSite: cookie.sameSite }
        : {}),
    })
  }
  return out
}

const SAVE_DEBOUNCE_MS = 100
const KEY_ACCOUNT = "cookie-jar-key"
const PLAIN_PREFIX = "plain:"
const ENC_PREFIX = "enc:v1:"

interface CookieJarTiming {
  lockTimeoutMs: number
  staleLockMs: number
  minBackoffMs: number
  maxBackoffMs: number
}

const DEFAULT_TIMING: CookieJarTiming = {
  lockTimeoutMs: 5000,
  staleLockMs: 30_000,
  minBackoffMs: 25,
  maxBackoffMs: 250,
}

let timing = { ...DEFAULT_TIMING }

export function setCookieJarTimingForTests(
  overrides?: Partial<CookieJarTiming>,
): void {
  timing = overrides
    ? { ...DEFAULT_TIMING, ...overrides }
    : { ...DEFAULT_TIMING }
}

type CookieMutation =
  | { type: "response"; url: string; setCookie: string }
  | { type: "put"; cookie: RequiredManualCookie }
  | { type: "delete"; domain: string; path: string; name: string }
  | { type: "delete-domain"; domain: string }
  | { type: "clear" }

interface RequiredManualCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: Date | null
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
  sameSite?: "strict" | "lax" | "none"
}

interface LoadedJar {
  jar: CookieJar
  key: Buffer | null
  status: CookieJarStatus
}

interface LockHandle {
  release(): Promise<void>
}

const activeHandles = new Set<CollectionCookieJar>()

export class CollectionCookieJar {
  private jar = newCookieJar()
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private journal: CookieMutation[] = []
  private writeChain: Promise<void> = Promise.resolve()
  private currentStatus: CookieJarStatus = { state: "encrypted" }
  private closed = false

  private constructor(readonly file: string) {}

  static async open(
    configDir: string,
    collectionId: string,
  ): Promise<CollectionCookieJar> {
    const handle = new CollectionCookieJar(
      join(configDir, "cookies", `${collectionId}.json`),
    )
    let lock: LockHandle | null = null
    try {
      lock = await acquireLock(handle.file)
      const loaded = await loadJar(handle.file)
      handle.jar = loaded.jar
      handle.currentStatus = loaded.status
    } catch (error) {
      handle.currentStatus = {
        state: "unavailable",
        error: asStorageError(error, handle.file, "read"),
      }
    } finally {
      try {
        await lock?.release()
      } catch (error) {
        handle.currentStatus = {
          state: "unavailable",
          error: asStorageError(error, handle.file, "write"),
        }
      }
    }
    activeHandles.add(handle)
    return handle
  }

  get status(): CookieJarStatus {
    return this.currentStatus
  }

  get warnings(): string[] {
    return cookieJarWarnings(this.currentStatus)
  }

  cookieHeaderFor(url: string): string {
    if (this.currentStatus.state === "unavailable") return ""
    return this.jar.getCookieStringSync(url)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  storeResponseCookies(url: string, headers: Headers): void {
    let stored = false
    for (const setCookie of headers.getSetCookie()) {
      const mutation: CookieMutation = { type: "response", url, setCookie }
      try {
        if (applyResponseMutation(this.jar, mutation)) {
          this.journal.push(mutation)
          stored = true
        }
      } catch {
        // Invalid server cookies are ignored without affecting valid cookies.
      }
    }
    if (stored) this.changed()
  }

  put(cookie: CookieInput): void {
    const normalized = normalizeManualCookie(cookie)
    applyPutMutation(this.jar, normalized)
    this.journal.push({ type: "put", cookie: normalized })
    this.changed()
  }

  list(): JarCookie[] {
    const serialized = this.jar.serializeSync()
    if (!serialized) return []
    const cookies: JarCookie[] = []
    for (const entry of serialized.cookies) {
      const cookie = Cookie.fromJSON(entry)
      if (cookie) cookies.push(toJarCookie(cookie))
    }
    return cookies
  }

  async deleteCookie(
    domain: string,
    path: string,
    name: string,
  ): Promise<void> {
    const mutation: CookieMutation = { type: "delete", domain, path, name }
    await applyMutation(this.jar, mutation)
    this.journal.push(mutation)
    this.changed()
  }

  async deleteDomain(domain: string): Promise<void> {
    const mutation: CookieMutation = { type: "delete-domain", domain }
    await applyMutation(this.jar, mutation)
    this.journal.push(mutation)
    this.changed()
  }

  async clear(): Promise<void> {
    const mutation: CookieMutation = { type: "clear" }
    await applyMutation(this.jar, mutation)
    this.journal.push(mutation)
    this.changed()
  }

  async refresh(): Promise<void> {
    await this.enqueue(async () => {
      const lock = await acquireLock(this.file)
      try {
        const loaded = await loadJar(this.file)
        for (const mutation of this.journal) {
          await applyMutation(loaded.jar, mutation)
        }
        this.jar = loaded.jar
        this.setStatus(loaded.status)
        this.emit()
      } catch (error) {
        this.fail(error, "read")
      } finally {
        await lock.release()
      }
    })
  }

  scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.saveNow().catch(() => {})
    }, SAVE_DEBOUNCE_MS)
  }

  async saveNow(): Promise<void> {
    this.clearTimer()
    await this.enqueue(async () => {
      if (this.journal.length === 0) return
      const committedCount = this.journal.length
      const pending = this.journal.slice(0, committedCount)
      let lock: LockHandle | null = null
      try {
        lock = await acquireLock(this.file)
        const loaded = await loadJar(this.file)
        for (const mutation of pending)
          await applyMutation(loaded.jar, mutation)
        const written = await writeJar(this.file, loaded.jar, loaded.key)
        this.journal.splice(0, committedCount)
        for (const mutation of this.journal) {
          await applyMutation(written.jar, mutation)
        }
        this.jar = written.jar
        this.setStatus(written.status)
        this.emit()
      } catch (error) {
        this.fail(error, "write")
      } finally {
        await lock?.release()
      }
    })
  }

  async reset(): Promise<{ backupPath?: string }> {
    this.clearTimer()
    let result: { backupPath?: string } = {}
    await this.enqueue(async () => {
      let lock: LockHandle | null = null
      try {
        lock = await acquireLock(this.file)
        const backupPath = await backupExistingJar(this.file)
        const committedCount = this.journal.length
        const pending = this.journal.slice(0, committedCount)
        const jar = newCookieJar()
        for (const mutation of pending) await applyMutation(jar, mutation)
        const written = await writeJar(this.file, jar, null)
        this.journal.splice(0, committedCount)
        for (const mutation of this.journal) {
          await applyMutation(written.jar, mutation)
        }
        this.jar = written.jar
        this.setStatus(written.status)
        this.emit()
        result = backupPath ? { backupPath } : {}
      } catch (error) {
        this.fail(error, "write")
      } finally {
        await lock?.release()
      }
    })
    return result
  }

  async close(): Promise<void> {
    if (this.closed) return
    await this.saveNow()
    this.closed = true
    activeHandles.delete(this)
    this.listeners.clear()
  }

  private changed(): void {
    this.scheduleSave()
    this.emit()
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(operation)
    this.writeChain = next.catch(() => {})
    return next
  }

  private fail(error: unknown, fallbackCode: "read" | "write"): never {
    const storageError = asStorageError(error, this.file, fallbackCode)
    this.setStatus({ state: "unavailable", error: storageError })
    this.emit()
    throw storageError
  }

  private setStatus(status: CookieJarStatus): void {
    this.currentStatus = status
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export async function flushAll(): Promise<void> {
  const results = await Promise.allSettled(
    [...activeHandles].map((handle) => handle.saveNow()),
  )
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `Failed to flush ${failures.length} cookie jar${failures.length === 1 ? "" : "s"}`,
    )
  }
}

function newCookieJar(): CookieJar {
  return new CookieJar(undefined, { prefixSecurity: "strict" })
}

async function applyMutation(
  jar: CookieJar,
  mutation: CookieMutation,
): Promise<void> {
  switch (mutation.type) {
    case "response":
      applyResponseMutation(jar, mutation)
      return
    case "put":
      applyPutMutation(jar, mutation.cookie)
      return
    case "delete":
      await jar.store.removeCookie(
        mutation.domain,
        mutation.path,
        mutation.name,
      )
      return
    case "delete-domain":
      await jar.store.removeCookies(mutation.domain, null)
      return
    case "clear":
      jar.removeAllCookiesSync()
  }
}

function applyResponseMutation(
  jar: CookieJar,
  mutation: Extract<CookieMutation, { type: "response" }>,
): boolean {
  try {
    return Boolean(
      jar.setCookieSync(mutation.setCookie, mutation.url, {
        ignoreError: true,
      }),
    )
  } catch {
    return false
  }
}

function normalizeManualCookie(cookie: CookieInput): RequiredManualCookie {
  const name = cookie.name.trim()
  const domain = cookie.domain.trim().replace(/^\./, "").toLowerCase()
  const path = cookie.path || "/"
  const secure = cookie.secure ?? false
  const hostOnly = cookie.hostOnly ?? false
  if (!name) throw new CookieValidationError("cookie name is required")
  if (!domain) throw new CookieValidationError("cookie domain is required")
  if (/\s|\/|:\/\//.test(domain)) {
    throw new CookieValidationError("cookie domain must be a hostname")
  }
  if (!path.startsWith("/")) {
    throw new CookieValidationError("cookie path must start with /")
  }
  if (name.startsWith("__Secure-") && !secure) {
    throw new CookieValidationError("__Secure- cookies must be Secure")
  }
  if (name.startsWith("__Host-") && (!secure || !hostOnly || path !== "/")) {
    throw new CookieValidationError(
      "__Host- cookies must be Secure, host-only, and use path /",
    )
  }
  return {
    name,
    value: cookie.value ?? "",
    domain,
    path,
    expires: cookie.expires ?? null,
    secure,
    httpOnly: cookie.httpOnly ?? false,
    hostOnly,
    ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
  }
}

function applyPutMutation(jar: CookieJar, cookie: RequiredManualCookie): void {
  const instance = new Cookie({
    key: cookie.name,
    value: cookie.value,
    ...(!cookie.hostOnly ? { domain: cookie.domain } : {}),
    path: cookie.path,
    expires: cookie.expires,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
  })
  if (
    !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookie.name) ||
    !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(cookie.value)
  ) {
    throw new CookieValidationError("cookie contains an invalid name or value")
  }
  try {
    const stored = jar.setCookieSync(
      instance,
      `${cookie.secure ? "https" : "http"}://${cookie.domain}${cookie.path}`,
      { ignoreError: false },
    )
    if (!stored) throw new Error("cookie was rejected")
  } catch (error) {
    if (error instanceof CookieValidationError) throw error
    const detail = error instanceof Error ? `: ${error.message}` : ""
    throw new CookieValidationError(
      `cookie domain or attributes are invalid${detail}`,
      { cause: error },
    )
  }
}

function toJarCookie(cookie: Cookie): JarCookie {
  const sameSite =
    cookie.sameSite === "strict" ||
    cookie.sameSite === "lax" ||
    cookie.sameSite === "none"
      ? cookie.sameSite
      : undefined
  return {
    name: cookie.key,
    value: cookie.value,
    domain: cookie.domain ?? "",
    path: cookie.path ?? "/",
    expires: expiryDate(cookie),
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    hostOnly: cookie.hostOnly ?? false,
    ...(sameSite ? { sameSite } : {}),
  }
}

async function loadJar(file: string): Promise<LoadedJar> {
  const serialized = await readState(file)
  if (serialized === null) {
    return {
      jar: newCookieJar(),
      key: null,
      status: { state: "encrypted" },
    }
  }

  let plain: string
  let key: Buffer | null = null
  let status: CookieJarStatus
  if (serialized.startsWith(ENC_PREFIX)) {
    key = await loadExistingKey()
    if (!key) {
      throw new CookieJarStorageError(
        "key-unavailable",
        "Cookie storage is unavailable because its encryption key could not be loaded.",
        file,
      )
    }
    const decrypted = decrypt(serialized, key)
    if (decrypted === null) {
      throw new CookieJarStorageError(
        "decrypt",
        "Cookie storage is unavailable because the encrypted file could not be decrypted.",
        file,
      )
    }
    plain = decrypted
    status = { state: "encrypted" }
  } else if (serialized.startsWith(PLAIN_PREFIX)) {
    plain = serialized.slice(PLAIN_PREFIX.length)
    status = {
      state: "plaintext-warning",
      warning: COOKIE_PLAINTEXT_WARNING,
    }
  } else {
    throw new CookieJarStorageError(
      "unknown-format",
      "Cookie storage is unavailable because the file format is unknown.",
      file,
    )
  }

  try {
    const parsed = JSON.parse(plain) as SerializedCookieJar
    return {
      jar: CookieJar.deserializeSync(parsed),
      key,
      status,
    }
  } catch (error) {
    throw new CookieJarStorageError(
      "malformed",
      "Cookie storage is unavailable because the file is malformed.",
      file,
      { cause: error },
    )
  }
}

async function writeJar(
  file: string,
  jar: CookieJar,
  existingKey: Buffer | null,
): Promise<LoadedJar> {
  const serialized = jar.serializeSync()
  const key = existingKey ?? (await loadOrCreateKey())
  const state = key
    ? encrypt(JSON.stringify(serialized), key)
    : `${PLAIN_PREFIX}${JSON.stringify(serialized)}`
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${randomUUID()}`
  try {
    await writeFile(tmp, state, { encoding: "utf8", mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, file)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw new CookieJarStorageError(
      "write",
      "Cookie storage could not be saved.",
      file,
      { cause: error },
    )
  }
  return {
    jar,
    key,
    status: key
      ? { state: "encrypted" }
      : { state: "plaintext-warning", warning: COOKIE_PLAINTEXT_WARNING },
  }
}

async function loadExistingKey(): Promise<Buffer | null> {
  try {
    const stored = await getAppSettingSecret(KEY_ACCOUNT)
    if (!stored) return null
    const key = Buffer.from(stored, "hex")
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

async function loadOrCreateKey(): Promise<Buffer | null> {
  try {
    const stored = await getAppSettingSecret(KEY_ACCOUNT)
    if (stored) {
      const existing = Buffer.from(stored, "hex")
      if (existing.length === 32) return existing
    }
    const key = randomBytes(32)
    await setAppSettingSecret(KEY_ACCOUNT, key.toString("hex"))
    return key
  } catch {
    return null
  }
}

async function readState(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8")
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null
    throw new CookieJarStorageError(
      "read",
      "Cookie storage could not be read.",
      file,
      { cause: error },
    )
  }
}

async function backupExistingJar(file: string): Promise<string | undefined> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = `${file}.backup-${timestamp}-${randomUUID()}`
  try {
    await rename(file, backupPath)
    return backupPath
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined
    throw new CookieJarStorageError(
      "write",
      "Cookie storage could not be backed up for recovery.",
      file,
      { cause: error },
    )
  }
}

async function acquireLock(file: string): Promise<LockHandle> {
  const lockDir = `${file}.lock`
  const ownerFile = join(lockDir, "owner")
  const owner = `${process.pid}:${randomUUID()}`
  const started = Date.now()
  await mkdir(dirname(file), { recursive: true })

  while (true) {
    try {
      await mkdir(lockDir)
      try {
        await writeFile(ownerFile, owner, { encoding: "utf8", mode: 0o600 })
      } catch (error) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {})
        throw error
      }
      return {
        async release() {
          try {
            if ((await readFile(ownerFile, "utf8")) !== owner) return
            await rm(lockDir, { recursive: true, force: true })
          } catch (error) {
            if (!hasCode(error, "ENOENT")) throw error
          }
        },
      }
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw new CookieJarStorageError(
          "write",
          "Cookie storage lock could not be created.",
          file,
          { cause: error },
        )
      }
    }

    if (await recoverStaleLock(lockDir)) continue
    if (Date.now() - started >= timing.lockTimeoutMs) {
      throw new CookieJarStorageError(
        "lock-timeout",
        "Cookie storage is busy in another process; retry after that process finishes.",
        file,
      )
    }
    const spread = timing.maxBackoffMs - timing.minBackoffMs
    const delay = timing.minBackoffMs + Math.floor(Math.random() * (spread + 1))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

async function recoverStaleLock(lockDir: string): Promise<boolean> {
  try {
    const details = await stat(lockDir)
    if (Date.now() - details.mtimeMs <= timing.staleLockMs) return false
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true
    return false
  }

  const stale = `${lockDir}.stale-${randomUUID()}`
  try {
    await rename(lockDir, stale)
  } catch (error) {
    if (hasCode(error, "ENOENT")) return true
    return false
  }
  await rm(stale, { recursive: true, force: true })
  return true
}

function asStorageError(
  error: unknown,
  file: string,
  fallbackCode: "read" | "write",
): CookieJarStorageError {
  if (error instanceof CookieJarStorageError) return error
  return new CookieJarStorageError(
    fallbackCode,
    fallbackCode === "read"
      ? "Cookie storage could not be read."
      : "Cookie storage could not be saved.",
    file,
    { cause: error },
  )
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  )
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ])
  return `${ENC_PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("base64")}`
}

function decrypt(state: string, key: Buffer): string | null {
  if (!state.startsWith(ENC_PREFIX)) return null
  const [ivHex, tagHex, data] = state.slice(ENC_PREFIX.length).split(":")
  if (!ivHex || !tagHex || !data) return null
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex"),
    )
    decipher.setAuthTag(Buffer.from(tagHex, "hex"))
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}
