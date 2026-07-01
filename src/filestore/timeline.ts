import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import * as yaml from "js-yaml"
import type { TimelineEntry } from "../schema"

const DEFAULT_MAX_ENTRIES = 50

function timelineDir(colDir: string): string {
  return join(colDir, ".timeline")
}

function timelinePath(colDir: string, reqId: string): string {
  return join(timelineDir(colDir), `${reqId}.yml`)
}

export async function loadTimeline(
  colDir: string,
  reqId: string,
): Promise<TimelineEntry[]> {
  try {
    const raw = await readFile(timelinePath(colDir, reqId), "utf8")
    const data = yaml.load(raw)
    if (!Array.isArray(data)) return []
    return data as TimelineEntry[]
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
  const filePath = join(timelineDir(colDir), "index.yml")
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, yaml.dump([]), "utf8")
  } catch {
    // ignore
  }
}
