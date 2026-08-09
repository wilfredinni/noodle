import { homedir } from "node:os"
import { resolve } from "node:path"
import { classifyPath } from "../../collectionPath"
import { expandUserPath } from "../../userPath"

export type CollectionRegistrationResult =
  { ok: true; path: string } | { ok: false; error: string }

export function resolveCollectionRegistration(
  rawPath: string,
  registeredPaths: string[],
  cwd = process.cwd(),
  home = homedir(),
): CollectionRegistrationResult {
  const value = rawPath.trim()
  if (!value) return { ok: false, error: "Collection path is required" }
  const path = resolve(cwd, expandUserPath(value, home))
  if (registeredPaths.includes(path)) {
    return { ok: false, error: "Collection is already registered" }
  }
  if (classifyPath(path) !== "collection") {
    return {
      ok: false,
      error: "Path must be an initialized Noodle collection",
    }
  }
  return { ok: true, path }
}

export function moveRegisteredCollection(
  collections: string[],
  index: number,
  delta: -1 | 1,
): string[] | null {
  const target = index + delta
  if (
    index < 0 ||
    index >= collections.length ||
    target < 0 ||
    target >= collections.length
  ) {
    return null
  }
  const next = [...collections]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  return next
}

export function unregisterCollection(
  collections: string[],
  index: number,
): string[] | null {
  if (index < 0 || index >= collections.length) return null
  return collections.filter((_, itemIndex) => itemIndex !== index)
}
