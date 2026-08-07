import { readdirSync } from "node:fs"
import { join } from "node:path"
import type { ExportOptions, ExportResult } from "../app/export"
import { expandUserPath } from "../userPath"

export type ExportFormat = "openapi" | "postman"

export interface ExportCollectionValues {
  format: ExportFormat
  outputDir: string
}

type ExportRunner = (options: ExportOptions) => Promise<ExportResult>

function isAvailablePostmanTarget(path: string): boolean {
  try {
    return readdirSync(path).length === 0
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
  }
}

export function getExportTargetPath(
  outputDir: string,
  collectionName: string,
  format: ExportFormat,
): string {
  const root = expandUserPath(outputDir)
  if (format === "openapi") {
    return join(root, `${collectionName}.openapi.yml`)
  }

  const name = `${collectionName}-postman`
  let target = join(root, name)
  let suffix = 2
  while (!isAvailablePostmanTarget(target)) {
    target = join(root, `${name}-${suffix++}`)
  }
  return target
}

export async function runCollectionExport({
  collectionDir,
  collectionName,
  values,
  hasUnsavedChanges,
  pending,
  runExport,
}: {
  collectionDir: string
  collectionName: string
  values: ExportCollectionValues
  hasUnsavedChanges: boolean
  pending: { current: boolean }
  runExport?: ExportRunner
}): Promise<ExportResult | null> {
  if (hasUnsavedChanges) {
    throw new Error("Save all changes before exporting")
  }
  if (pending.current) return null

  pending.current = true
  try {
    const execute = runExport ?? (await import("../app/export")).runExport
    return await execute({
      collection: collectionDir,
      format: values.format,
      output: getExportTargetPath(
        values.outputDir,
        collectionName,
        values.format,
      ),
    })
  } finally {
    pending.current = false
  }
}
