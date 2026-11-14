import type { Collection, Environment } from "../schema"

export interface ScriptImportWarning {
  code: "foreign-script-not-converted"
  format: "postman" | "insomnia"
  itemPath: string[]
  phase: string
  message: string
  unsupportedGlobals?: string[]
  reason?:
    | "syntax"
    | "unsupported-globals"
    | "unverifiable"
    | "unsupported-placement"
}

export interface OpenApiImportWarning {
  code: "openapi-field-not-converted"
  format: "openapi"
  itemPath: string[]
  field: string
  message: string
}

export interface ImportCleanupWarning {
  code: "import-cleanup-failed"
  format: "import"
  itemPath: string[]
  field: "cleanup"
  message: string
}

export type ImportWarning =
  | ScriptImportWarning
  | OpenApiImportWarning
  | ImportCleanupWarning

export function formatImportWarning(warning: ImportWarning): string {
  const field = "phase" in warning ? warning.phase : warning.field
  return `${JSON.stringify(warning.itemPath.join(" / "))} (${JSON.stringify(field)}): ${warning.message}`
}

export interface ImportResult<W extends ImportWarning = ImportWarning> {
  collection: Collection
  environments: Environment[]
  warnings?: W[]
}

export interface Importer {
  type: string
  detect(content: string): boolean
  import(content: string): ImportResult | Promise<ImportResult>
}

const _registry: Importer[] = []

export function registerImporter(importer: Importer): void {
  const idx = _registry.findIndex((i) => i.type === importer.type)
  if (idx !== -1) {
    _registry[idx] = importer
    return
  }
  _registry.push(importer)
}

export function detectFormat(content: string): string | null {
  for (const importer of _registry) {
    if (importer.detect(content)) return importer.type
  }
  return null
}

export function getImporter(type: string): Importer | undefined {
  return _registry.find((i) => i.type === type)
}

export function supportedFormats(): string[] {
  return _registry.map((i) => i.type)
}

export function clearRegistry(): void {
  _registry.length = 0
}
