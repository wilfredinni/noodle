import { join } from "node:path"
import type { ExportOptions, ExportResult } from "../app/export"
import { expandUserPath } from "../userPath"

export type ExportFormat = "openapi" | "postman"

export interface ExportCollectionValues {
  format: ExportFormat
  outputDir: string
}

type ExportRunner = (options: ExportOptions) => Promise<ExportResult>

export function getExportTargetPath(
  outputDir: string,
  collectionName: string,
  format: ExportFormat,
): string {
  const name =
    format === "openapi"
      ? `${collectionName}.openapi.yml`
      : `${collectionName}-postman`
  return join(expandUserPath(outputDir), name)
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
