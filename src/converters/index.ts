import type { Collection, Environment } from "../schema"

export interface ImportResult {
  collection: Collection
  environments: Environment[]
}

export interface Importer {
  type: string
  detect(content: string): boolean
  import(content: string): ImportResult
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
