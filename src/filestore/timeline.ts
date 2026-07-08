import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import * as yaml from "js-yaml"
import type { ParamEntry, TimelineEntry } from "../schema"

const DEFAULT_MAX_ENTRIES = 50

function timelineDir(colDir: string): string {
  return join(colDir, ".timeline")
}

function timelinePath(colDir: string, reqId: string): string {
  return join(timelineDir(colDir), `${reqId}.yml`)
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
        const enabled =
          obj.enabled === undefined ? true : Boolean(obj.enabled)
        out.push({ name: k, value: String(obj.value ?? ""), enabled })
      }
    }
    return out
  }
  return []
}

function migrateEntry(entry: Record<string, unknown>): TimelineEntry {
  const req = (entry.request ?? {}) as Record<string, unknown>
  return {
    ...entry,
    request: {
      ...req,
      params: migrateParams(req.params),
    },
  } as TimelineEntry
}

export async function loadTimeline(
  colDir: string,
  reqId: string,
): Promise<TimelineEntry[]> {
  try {
    const raw = await readFile(timelinePath(colDir, reqId), "utf8")
    const data = yaml.load(raw)
    if (!Array.isArray(data)) return []
    return (data as Record<string, unknown>[]).map(migrateEntry)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return []
    return []
  }
}

export async function saveTimelineEntry(
  colDir: string,
  reqId: string,
  entry: TimelineEntry,
  maxEntries = DEFAULT_MAX_ENTRIES,
): Promise<void> {
  const filePath = timelinePath(colDir, reqId)
  await mkdir(dirname(filePath), { recursive: true })

  const current = await loadTimeline(colDir, reqId)
  current.unshift(entry)

  if (current.length > maxEntries) {
    current.length = maxEntries
  }

  const yamlText = yaml.dump(current)
  await writeFile(filePath, yamlText, "utf8")
}

export async function clearTimelineForRequest(
  colDir: string,
  reqId: string,
): Promise<void> {
  const filePath = join(timelineDir(colDir), `${reqId}.yml`)
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, yaml.dump([]), "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return
    throw e
  }
}

export async function clearAllTimeline(colDir: string): Promise<void> {
  const dir = timelineDir(colDir)
  try {
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".yml"))
        .map((e) => writeFile(join(dir, e.name), yaml.dump([]), "utf8")),
    )
  } catch {
    // ignore
  }
}
