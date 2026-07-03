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
import type { Collection, Environment } from "../schema"

import { openApiImporter } from "../converters/openapi/index"
import { postmanImporter } from "../converters/postman/index"
registerImporter(openApiImporter)
registerImporter(postmanImporter)

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

export async function runImport(
  source: string,
  format: string | undefined,
  outputDir: string,
): Promise<void> {
  let content: string
  try {
    content = readFileSync(source, "utf-8")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(
      `error: cannot read source file "${source}": ${msg}\n`,
    )
    process.exit(1)
  }

  let importerType = format
  if (!importerType) {
    const detected = detectFormat(content)
    if (!detected) {
      process.stderr.write(
        `error: cannot detect format of "${source}". Supported: ${supportedFormats().join(", ")}\n`,
      )
      process.exit(1)
    }
    importerType = detected
  }

  const importer = getImporter(importerType)
  if (!importer) {
    process.stderr.write(
      `error: unknown import format "${importerType}". Supported: ${supportedFormats().join(", ")}\n`,
    )
    process.exit(1)
  }

  let result: ImportResult
  try {
    result = importer.import(content)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(`error: ${msg}\n`)
    process.exit(1)
  }

  if (result.collection.items.length === 0) {
    process.stderr.write(
      "error: nothing to import — spec contains no operations\n",
    )
    process.exit(1)
  }

  const collDir = join(outputDir, result.collection.id)

  try {
    await writeCollection(collDir, result.collection)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(`error: failed to write collection: ${msg}\n`)
    process.exit(1)
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

  process.stdout.write(
    `Imported ${result.collection.name} → ${collDir}\n`,
  )
}
