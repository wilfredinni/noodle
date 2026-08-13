import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Cookie, CookieJar } from "tough-cookie"
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
  sameSite?: "strict" | "lax" | "none"
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
      expires:
        cookie.expires instanceof Date ? cookie.expires.toISOString() : null,
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

const SAVE_DEBOUNCE_MS = 5000
const KEY_ACCOUNT = "cookie-jar-key"
const PLAIN_PREFIX = "plain:"
const ENC_PREFIX = "enc:v1:"

export class CollectionCookieJar {
  private jar = new CookieJar()
  private key: Buffer | null = null
  private keyLoaded = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastSaved: string | null = null
  private constructor(readonly file: string) {}

  static async open(
    configDir: string,
    collectionId: string,
  ): Promise<CollectionCookieJar> {
    const handle = new CollectionCookieJar(
      join(configDir, "cookies", `${collectionId}.json`),
    )
    const serialized = await readState(handle.file)
    if (serialized !== null) {
      let plain: string | null = null
      if (serialized.startsWith(ENC_PREFIX)) {
        handle.key = await loadOrCreateKey()
        handle.keyLoaded = true
        if (handle.key) plain = decrypt(serialized, handle.key)
      } else if (serialized.startsWith(PLAIN_PREFIX)) {
        plain = serialized.slice(PLAIN_PREFIX.length)
      }
      if (plain !== null) {
        try {
          handle.jar = CookieJar.deserializeSync(plain)
        } catch {
          // ponytail: corrupt jar file, start empty
        }
      }
    }
    handle.lastSaved = serialized
    return handle
  }

  cookieHeaderFor(url: string): string {
    return this.jar.getCookieStringSync(url)
  }

  storeResponseCookies(url: string, headers: Headers): void {
    let stored = false
    for (const setCookie of headers.getSetCookie()) {
      try {
        this.jar.setCookieSync(setCookie, url, { ignoreError: true })
        stored = true
      } catch {
        // ignore malformed Set-Cookie headers
      }
    }
    if (stored) this.scheduleSave()
  }

  put(cookie: CookieInput): void {
    const name = cookie.name.trim()
    const domain = cookie.domain.trim().replace(/^\./, "")
    if (!name) throw new Error("cookie name is required")
    if (!domain) throw new Error("cookie domain is required")
    const path = cookie.path || "/"
    const value = cookie.value ?? ""
    const expires = cookie.expires ?? null
    const instance = new Cookie({
      key: name,
      value,
      domain,
      path,
      expires,
      secure: cookie.secure ?? false,
      httpOnly: cookie.httpOnly ?? false,
      ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    })
    this.jar.setCookieSync(instance, `http://${domain}${path}`, {
      ignoreError: true,
    })
    this.scheduleSave()
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
    await this.jar.store.removeCookie(domain, path, name)
    this.scheduleSave()
  }

  async deleteDomain(domain: string): Promise<void> {
    await this.jar.store.removeCookies(domain, null)
    this.scheduleSave()
  }

  async clear(): Promise<void> {
    this.jar.removeAllCookiesSync()
    this.scheduleSave()
  }

  scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      // ponytail: best-effort persistence, never crash on background saves
      void this.saveNow().catch(() => {})
    }, SAVE_DEBOUNCE_MS)
  }

  async saveNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const serialized = this.jar.serializeSync()
    if (!serialized) return
    if (serialized.cookies.length === 0 && this.lastSaved === null) return
    if (!this.keyLoaded) {
      this.key = await loadOrCreateKey()
      this.keyLoaded = true
    }
    const state = this.key
      ? encrypt(JSON.stringify(serialized), this.key)
      : `${PLAIN_PREFIX}${JSON.stringify(serialized)}`
    if (state === this.lastSaved) return
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(
      tmp,
      state,
      this.key ? "utf8" : { encoding: "utf8", mode: 0o600 },
    )
    if (!this.key) await chmod(tmp, 0o600).catch(() => {})
    await rename(tmp, this.file)
    this.lastSaved = state
  }
}

function toJarCookie(cookie: Cookie): JarCookie {
  const expires =
    cookie.expires === "Infinity" || cookie.expires === null
      ? null
      : cookie.expires instanceof Date
        ? cookie.expires
        : new Date(cookie.expires as string)
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
    expires,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(sameSite ? { sameSite } : {}),
  }
}

async function loadOrCreateKey(): Promise<Buffer | null> {
  try {
    const stored = await getAppSettingSecret(KEY_ACCOUNT)
    if (stored) return Buffer.from(stored, "hex")
    const key = randomBytes(32)
    await setAppSettingSecret(KEY_ACCOUNT, key.toString("hex"))
    return key
  } catch {
    // ponytail: vault unavailable, fall back to plaintext with 0600 perms
    return null
  }
}

async function readState(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8")
  } catch {
    return null
  }
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
