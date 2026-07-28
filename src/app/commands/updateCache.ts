import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import { compareStableVersions } from "./updateManifest"

export const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000
export const UPDATE_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000

export interface UpdateCache {
  latestTag: string
  checkedAt: number
  checksums: Record<string, string>
}

export function parseUpdateCache(value: unknown): UpdateCache | null {
  if (!value || typeof value !== "object") return null
  const cache = value as Record<string, unknown>
  if (
    typeof cache.latestTag !== "string" ||
    compareStableVersions(cache.latestTag, cache.latestTag) !== 0 ||
    typeof cache.checkedAt !== "number" ||
    !Number.isFinite(cache.checkedAt) ||
    cache.checkedAt < 0
  )
    return null
  const checksums = cache.checksums
  if (!checksums || typeof checksums !== "object") return null
  const normalized: Record<string, string> = {}
  for (const [key, hash] of Object.entries(checksums)) {
    if (typeof key !== "string" || typeof hash !== "string") return null
    if (!/^[a-f\d]{64}$/i.test(hash)) return null
    normalized[key] = hash.toLowerCase()
  }
  if (Object.keys(normalized).length === 0) return null
  return {
    latestTag: cache.latestTag,
    checkedAt: cache.checkedAt,
    checksums: normalized,
  }
}

export function isFreshUpdateCache(cache: UpdateCache, now: number): boolean {
  return now >= cache.checkedAt && now - cache.checkedAt <= UPDATE_CACHE_TTL_MS
}

export function isStaleUpdateCache(cache: UpdateCache, now: number): boolean {
  return (
    now >= cache.checkedAt && now - cache.checkedAt <= UPDATE_CACHE_STALE_MS
  )
}

export async function loadUpdateCache(
  cachePath: string,
): Promise<UpdateCache | null> {
  try {
    return parseUpdateCache(JSON.parse(await readFile(cachePath, "utf8")))
  } catch {
    return null
  }
}

export async function saveUpdateCache(
  cachePath: string,
  cache: UpdateCache,
): Promise<void> {
  const cacheDir = dirname(cachePath)
  await mkdir(cacheDir, { recursive: true })
  const tempDir = await mkdtemp(join(cacheDir, ".update-cache-"))
  const tempPath = join(tempDir, "update-cache.json")
  try {
    await writeFile(tempPath, `${JSON.stringify(cache)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(tempPath, cachePath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
