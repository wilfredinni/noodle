import { realpathSync } from "node:fs"
import { relative, resolve, sep } from "node:path"
import type { ImportOptions } from "../app/import"
import { expandUserPath } from "../userPath"

export type CollectionImportDestination = "new" | "current"

export interface CollectionImportValues {
  source: string
  destination: CollectionImportDestination
  parentDir: string
}

export interface CollectionImportResult {
  path: string
  name: string
  formattedJsonBodies: number
}

type ImportRunner = (options: ImportOptions) => Promise<CollectionImportResult>

function canonicalPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function isInsideCollection(collectionDir: string, parentDir: string): boolean {
  const rel = relative(canonicalPath(collectionDir), canonicalPath(parentDir))
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`))
}

export async function runCollectionImport({
  values,
  collectionDir,
  hasUnsavedChanges,
  pending,
  runImport,
}: {
  values: CollectionImportValues
  collectionDir: string
  hasUnsavedChanges: boolean
  pending: { current: boolean }
  runImport?: ImportRunner
}): Promise<CollectionImportResult | null> {
  if (values.destination === "current" && hasUnsavedChanges) {
    throw new Error("Save all changes before importing into this collection")
  }
  const parentDir = expandUserPath(values.parentDir)
  if (
    values.destination === "new" &&
    isInsideCollection(collectionDir, parentDir)
  ) {
    throw new Error("Choose a parent folder outside the current collection")
  }
  if (pending.current) return null

  pending.current = true
  try {
    const execute = runImport ?? (await import("../app/import")).runImport
    return await execute({
      source: expandUserPath(values.source),
      silent: true,
      destination:
        values.destination === "current"
          ? { kind: "current", collectionDir }
          : { kind: "new", parentDir },
    })
  } finally {
    pending.current = false
  }
}
