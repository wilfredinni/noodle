import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  getImporter,
  detectFormat,
  registerImporter,
  supportedFormats,
  type ImportResult,
} from "../converters/index"
import { saveRequest, saveFolder } from "../filestore"
import { collectionFormat } from "./services"
import type { Collection, Environment } from "../schema"

function serializeEnv(env: Environment): string {
  let out = ""
  if (env.color) out += `_color=${env.color}\n`
  for (const [key, value] of Object.entries(env.vars)) {
    out += `${key}=${value}\n`
  }
  if (env.disabledVars) {
    for (const [key, value] of Object.entries(env.disabledVars)) {
      out += `# ${key}=${value}\n`
    }
  }
  return out
}

async function writeCollection(
  dir: string,
  collection: Collection,
): Promise<void> {
  for (const item of collection.items) {
    if (item.type === "request") {
      await saveRequest(dir, item.data)
    } else if (item.type === "folder") {
      const folder = item.data
      await saveFolder(dir, folder)
      await writeCollection(dir, {
        id: folder.id,
        name: folder.name,
        items: folder.children,
      })
    }
  }
}

export interface ImportOptions {
  source: string
  format?: string
  outputDir?: string
  silent?: boolean
}

let _importersRegistered = false

export async function runImport(
  options: ImportOptions,
): Promise<{ path: string; name: string; formattedJsonBodies: number }> {
  if (!_importersRegistered) {
    const { openApiImporter } = await import("../converters/openapi/index")
    const { swaggerImporter } = await import("../converters/swagger/index")
    const { postmanImporter } = await import("../converters/postman/index")
    registerImporter(openApiImporter)
    registerImporter(swaggerImporter)
    registerImporter(postmanImporter)
    _importersRegistered = true
  }
  const { source, format, outputDir = "./collections" } = options
  let content: string
  try {
    content = readFileSync(source, "utf-8")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`cannot read source file "${source}": ${msg}`, { cause: e })
  }

  let importerType = format
  if (!importerType) {
    const detected = detectFormat(content)
    if (!detected) {
      throw new Error(
        `cannot detect format of "${source}". Supported: ${supportedFormats().join(", ")}`,
      )
    }
    importerType = detected
  }

  const importer = getImporter(importerType)
  if (!importer) {
    throw new Error(
      `unknown import format "${importerType}". Supported: ${supportedFormats().join(", ")}`,
    )
  }

  let result: ImportResult
  try {
    result = importer.import(content)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg, { cause: e })
  }

  if (result.collection.items.length === 0) {
    throw new Error("nothing to import — spec contains no operations")
  }

  const collDir = join(outputDir, result.collection.id)

  try {
    await writeCollection(collDir, result.collection)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`failed to write collection: ${msg}`, { cause: e })
  }

  if (result.environments.length > 0) {
    const envDir = join(collDir, ".environments")
    await mkdir(envDir, { recursive: true })
    for (const env of result.environments) {
      await writeFile(
        join(envDir, `${env.name}.env`),
        serializeEnv(env),
        "utf8",
      )
    }
  }

  const formatted = await collectionFormat(collDir)

  if (!options.silent)
    process.stdout.write(`Imported ${result.collection.name} → ${collDir}\n`)
  return {
    path: collDir,
    name: result.collection.name,
    formattedJsonBodies: formatted.formattedJsonBodies,
  }
}
