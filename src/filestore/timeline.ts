import { homedir } from "node:os"
import { randomUUID } from "node:crypto"
import { gzip, gunzip } from "node:zlib"
import { promisify } from "node:util"
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import * as yaml from "../yaml"
import type {
  JsonValue,
  ParamEntry,
  TimelineBodyRef,
  TimelineEntry,
} from "../schema"
import { redactKnownSecrets } from "../secrets/redact"

export const DEFAULT_TIMELINE_MAX_ENTRIES = 50
const INLINE_BODY_LIMIT = 10_000
const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)
const timelineLocks = new Map<string, Promise<void>>()

function withTimelineLock<T>(
  colDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = timelineLocks.get(colDir) ?? Promise.resolve()
  const current = previous.then(operation)
  const tail = current.then(
    () => {},
    () => {},
  )
  timelineLocks.set(colDir, tail)
  return current.finally(() => {
    if (timelineLocks.get(colDir) === tail) timelineLocks.delete(colDir)
  })
}

export async function getDownloadsDir(): Promise<string> {
  if (process.env.NOODLE_DOWNLOADS_DIR) {
    return process.env.NOODLE_DOWNLOADS_DIR
  }
  const home = homedir()
  if (process.platform === "linux") {
    if (process.env.XDG_DOWNLOAD_DIR) {
      return process.env.XDG_DOWNLOAD_DIR.replace("$HOME", home)
    }
    try {
      const userDirs = await readFile(
        join(home, ".config", "user-dirs.dirs"),
        "utf8",
      )
      const match = userDirs.match(/^XDG_DOWNLOAD_DIR="?([^"\n]+)"?/m)
      if (match && match[1]) {
        return match[1].replace("$HOME", home)
      }
    } catch {
      // Fallback if user-dirs.dirs doesn't exist
    }
  }
  return join(home, "Downloads")
}

function timelineDir(colDir: string): string {
  return join(colDir, ".timeline")
}

function timelinePath(colDir: string, reqId: string): string {
  return join(timelineDir(colDir), `${reqId}.yml`)
}

function bodyDir(colDir: string, reqId: string): string {
  return `${timelinePath(colDir, reqId)}.bodies`
}

function byteSize(body: string): number {
  return new TextEncoder().encode(body).length
}

function boundedAssertionValue(value: JsonValue): JsonValue {
  return byteSize(JSON.stringify(value)) > INLINE_BODY_LIMIT
    ? "[TRUNCATED]"
    : value
}

function bodyFile(entryId: string, kind: "request" | "response"): string {
  return `${entryId}-${kind}.gz`
}

function isSafeBodyFile(file: string): boolean {
  return (
    basename(file) === file && /^[a-f0-9-]+-(request|response)\.gz$/i.test(file)
  )
}

function migrateParams(params: unknown): ParamEntry[] {
  if (params === undefined || params === null) return []
  if (Array.isArray(params)) return params as ParamEntry[]
  if (typeof params === "object") {
    const out: ParamEntry[] = []
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (typeof v === "string") {
        out.push({ name: k, value: v, enabled: true })
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>
        const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled)
        out.push({ name: k, value: String(obj.value ?? ""), enabled })
      }
    }
    return out
  }
  return []
}

function migrateEntry(entry: Record<string, unknown>): TimelineEntry {
  const req = (entry.request ?? {}) as Record<string, unknown>
  const response = entry.response as Record<string, unknown> | undefined
  const responseBody =
    typeof response?.body === "string" ? response.body : undefined
  return {
    ...entry,
    request: {
      ...req,
      params: migrateParams(req.params),
    },
    response: response
      ? {
          ...response,
          bodyTruncated:
            responseBody?.length === INLINE_BODY_LIMIT &&
            typeof response.size === "number" &&
            response.size > INLINE_BODY_LIMIT &&
            response.bodyRef === undefined
              ? true
              : undefined,
        }
      : undefined,
  } as TimelineEntry
}

function parseTimeline(raw: string): TimelineEntry[] {
  const data = yaml.load(raw)
  if (!Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map(migrateEntry)
}

async function readTimelineEntries(
  colDir: string,
  reqId: string,
): Promise<TimelineEntry[]> {
  try {
    const raw = await readFile(timelinePath(colDir, reqId), "utf8")
    return parseTimeline(raw)
  } catch {
    return []
  }
}

async function writeBody(
  colDir: string,
  reqId: string,
  entryId: string,
  kind: "request" | "response",
  body: string,
): Promise<TimelineBodyRef> {
  const file = bodyFile(entryId, kind)
  const dir = bodyDir(colDir, reqId)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, file), await gzipAsync(Buffer.from(body, "utf8")))
  return { file, encoding: "gzip", size: byteSize(body) }
}

async function removeBody(
  colDir: string,
  reqId: string,
  ref: TimelineBodyRef | undefined,
): Promise<void> {
  if (!ref || !isSafeBodyFile(ref.file)) return
  await unlink(join(bodyDir(colDir, reqId), ref.file)).catch(() => {})
}

async function removeEntryBodies(
  colDir: string,
  reqId: string,
  entry: TimelineEntry,
): Promise<void> {
  await Promise.all([
    removeBody(colDir, reqId, entry.request.bodyRef),
    removeBody(colDir, reqId, entry.response?.bodyRef),
  ])
}

async function persistBodies(
  colDir: string,
  reqId: string,
  source: TimelineEntry,
): Promise<{ entry: TimelineEntry; refs: TimelineBodyRef[] }> {
  const id = source.id ?? randomUUID()
  const entry: TimelineEntry = {
    ...source,
    id,
    assertions: source.assertions
      ? {
          ...source.assertions,
          results: source.assertions.results.map((result) => ({
            ...result,
            ...(Object.hasOwn(result, "expected")
              ? { expected: boundedAssertionValue(result.expected!) }
              : {}),
            ...(Object.hasOwn(result, "actual")
              ? { actual: boundedAssertionValue(result.actual!) }
              : {}),
          })),
        }
      : undefined,
    request: { ...source.request },
    response: source.response ? { ...source.response } : undefined,
  }
  const refs: TimelineBodyRef[] = []

  try {
    if (
      entry.request.body &&
      byteSize(entry.request.body) > INLINE_BODY_LIMIT
    ) {
      const ref = await writeBody(
        colDir,
        reqId,
        id,
        "request",
        entry.request.body,
      )
      entry.request.bodyRef = ref
      entry.request.body = undefined
      refs.push(ref)
    }
    if (
      entry.response?.body &&
      byteSize(entry.response.body) > INLINE_BODY_LIMIT
    ) {
      const ref = await writeBody(
        colDir,
        reqId,
        id,
        "response",
        entry.response.body,
      )
      entry.response.bodyRef = ref
      entry.response.body = undefined
      refs.push(ref)
    }
  } catch (e) {
    await Promise.all(refs.map((ref) => removeBody(colDir, reqId, ref)))
    throw e
  }
  return { entry, refs }
}

export async function loadTimeline(
  colDir: string,
  reqId: string,
): Promise<TimelineEntry[]> {
  try {
    const raw = await readFile(timelinePath(colDir, reqId), "utf8")
    return parseTimeline(raw)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return []
    throw new Error(
      `filestore.loadTimeline: failed to load timeline for ${reqId}`,
      { cause: e },
    )
  }
}

export async function loadTimelineBody(
  colDir: string,
  reqId: string,
  ref: TimelineBodyRef,
): Promise<string> {
  if (!isSafeBodyFile(ref.file)) {
    throw new Error("filestore.loadTimelineBody: invalid body reference")
  }
  try {
    const compressed = await readFile(join(bodyDir(colDir, reqId), ref.file))
    return (await gunzipAsync(compressed)).toString("utf8")
  } catch (e) {
    throw new Error(
      "filestore.loadTimelineBody: failed to load timeline body",
      {
        cause: e,
      },
    )
  }
}

export async function exportTimelineEntry(
  colDir: string,
  entry: TimelineEntry,
  kind?: "request" | "response",
  loadedBody?: string,
): Promise<string> {
  const dir = await getDownloadsDir()
  await mkdir(dir, { recursive: true })

  const exportData: TimelineEntry = JSON.parse(JSON.stringify(entry))
  if (loadedBody !== undefined && kind) {
    if (kind === "request") {
      exportData.request.body = loadedBody
    } else if (kind === "response" && exportData.response) {
      exportData.response.body = loadedBody
    }
  }

  const file = `${entry.id ?? entry.timestamp}.yml`
  const path = join(dir, file)
  await writeFile(path, yaml.dump(exportData), "utf8")
  return path
}

export async function exportTimelineBody(
  colDir: string,
  entry: TimelineEntry,
  kind: "request" | "response",
  body: string,
): Promise<string> {
  return exportTimelineEntry(colDir, entry, kind, body)
}

export async function saveTimelineEntry(
  colDir: string,
  reqId: string,
  entry: TimelineEntry,
  maxEntries = DEFAULT_TIMELINE_MAX_ENTRIES,
): Promise<TimelineEntry> {
  return withTimelineLock(colDir, async () => {
    const filePath = timelinePath(colDir, reqId)
    await mkdir(dirname(filePath), { recursive: true })
    const { entry: persisted, refs } = await persistBodies(colDir, reqId, entry)
    const current = await readTimelineEntries(colDir, reqId)
    const next = [persisted, ...current]
    const evicted = next.splice(maxEntries)

    try {
      await writeFile(filePath, yaml.dump(next), "utf8")
    } catch (e) {
      await Promise.all(refs.map((ref) => removeBody(colDir, reqId, ref)))
      throw new Error(
        "filestore.saveTimelineEntry: failed to save timeline entry",
        {
          cause: e,
        },
      )
    }

    await Promise.all(
      evicted.map((old) => removeEntryBodies(colDir, reqId, old)),
    )
    return persisted
  })
}

async function collectTimelineFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return []
    throw e
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.endsWith(".yml.bodies")) {
        return collectTimelineFiles(path)
      }
      return Promise.resolve(
        entry.isFile() && entry.name.endsWith(".yml") ? [path] : [],
      )
    }),
  )
  return nested.flat()
}

export async function pruneTimeline(
  colDir: string,
  maxEntries: number,
): Promise<void> {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new Error(
      "filestore.pruneTimeline: max entries must be a non-negative integer",
    )
  }
  return withTimelineLock(colDir, async () => {
    const dir = timelineDir(colDir)
    try {
      if (maxEntries === 0) {
        await rm(dir, { recursive: true, force: true })
        await mkdir(dir, { recursive: true })
        return
      }
      for (const filePath of await collectTimelineFiles(dir)) {
        const reqId = relative(dir, filePath).slice(0, -".yml".length)
        const current = await readTimelineEntries(colDir, reqId)
        const evicted = current.slice(maxEntries)
        if (evicted.length === 0) continue
        await writeFile(
          filePath,
          yaml.dump(current.slice(0, maxEntries)),
          "utf8",
        )
        await Promise.all(
          evicted.map((entry) => removeEntryBodies(colDir, reqId, entry)),
        )
      }
    } catch (e) {
      throw new Error("filestore.pruneTimeline: failed to prune timeline", {
        cause: e,
      })
    }
  })
}

export async function clearTimelineForRequest(
  colDir: string,
  reqId: string,
): Promise<void> {
  const filePath = timelinePath(colDir, reqId)
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, yaml.dump([]), "utf8")
    await rm(bodyDir(colDir, reqId), { recursive: true, force: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return
    throw e
  }
}

export async function clearAllTimeline(colDir: string): Promise<void> {
  const dir = timelineDir(colDir)
  try {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
  } catch {
    // ignore
  }
}

function redactValue(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return redactKnownSecrets(value, secrets)
  if (Array.isArray(value))
    return value.map((item) => redactValue(item, secrets))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redactKnownSecrets(key, secrets),
        redactValue(item, secrets),
      ]),
    )
  }
  return value
}

function redactTimelineEntry(value: unknown, secrets: string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const entry = value as Record<string, unknown>
  return {
    ...entry,
    request: redactValue(entry.request, secrets),
    assertions: redactValue(entry.assertions, secrets),
    network: redactValue(entry.network, secrets),
    error: redactValue(entry.error, secrets),
  }
}

async function atomicWrite(
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, data)
  try {
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

async function collectAllTimelineFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? collectAllTimelineFiles(path) : [path]
    }),
  )
  return files.flat()
}

export async function redactTimelineSecrets(
  colDir: string,
  values: string[],
): Promise<void> {
  const secrets = [...new Set(values.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  if (secrets.length === 0) return
  return withTimelineLock(colDir, async () => {
    try {
      for (const path of await collectAllTimelineFiles(timelineDir(colDir))) {
        if (path.endsWith(".yml")) {
          const raw = await readFile(path, "utf8")
          const parsed = yaml.load(raw)
          const redacted = yaml.dump(
            Array.isArray(parsed)
              ? parsed.map((entry) => redactTimelineEntry(entry, secrets))
              : parsed,
          )
          if (redacted !== raw) await atomicWrite(path, redacted)
        } else if (path.endsWith(".gz") && !/-response\.gz$/i.test(path)) {
          const raw = await gunzipAsync(await readFile(path))
          const redacted = redactKnownSecrets(raw.toString("utf8"), secrets)
          if (redacted !== raw.toString("utf8")) {
            await atomicWrite(path, await gzipAsync(Buffer.from(redacted)))
          }
        }
      }
    } catch (error) {
      throw new Error("filestore.redactTimelineSecrets: redaction failed", {
        cause: error,
      })
    }
  })
}
