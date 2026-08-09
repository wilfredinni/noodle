import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

export type CollectionMode = "collection" | "browse" | "empty" | "invalid"

export function isDirectoryPath(dir: string): boolean {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function hasNoodleContent(dir: string): boolean {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      if (
        entry.isFile() &&
        entry.name.endsWith(".yml") &&
        entry.name !== "settings.yml"
      ) {
        return true
      }
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        hasNoodleContent(join(dir, entry.name))
      ) {
        return true
      }
    }
  } catch {
    // ignore
  }
  return false
}

export function classifyPath(dir: string): CollectionMode {
  if (!existsSync(dir)) return "invalid"
  if (!isDirectoryPath(dir)) return "invalid"

  const envDir = join(dir, ".environments")
  if (existsSync(envDir)) return "collection"
  const settingsPath = join(dir, "settings.yml")
  if (existsSync(settingsPath)) return "collection"

  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return "empty"
  }

  const hasRootRequest = entries.some(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".yml") &&
      entry.name !== "folder.yml" &&
      entry.name !== "settings.yml",
  )
  if (hasRootRequest) return "collection"

  if (hasNoodleContent(dir)) return "browse"

  return "empty"
}
