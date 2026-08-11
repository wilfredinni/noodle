import { existsSync, readFileSync, statSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, posix, relative, resolve, sep } from "node:path"
import { randomUUID } from "node:crypto"
import {
  getImporter,
  detectFormat,
  registerImporter,
  supportedFormats,
  type ImportResult,
} from "../converters/index"
import {
  loadSettings,
  saveRequest,
  saveFolder,
  saveSettings,
} from "../filestore"
import { formatJson } from "../lang/formatJson"
import type {
  Collection,
  CollectionItem,
  Environment,
  Request,
} from "../schema"

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
  overwrite = true,
): Promise<void> {
  for (const item of collection.items) {
    if (item.type === "request") {
      await saveRequest(dir, item.data, { overwrite })
    } else if (item.type === "folder") {
      const folder = item.data
      await saveFolder(dir, folder)
      await writeCollection(
        dir,
        {
          id: folder.id,
          name: folder.name,
          items: folder.children,
        },
        overwrite,
      )
    }
  }
}

function formatRequest(request: Request): {
  request: Request
  formatted: boolean
} {
  if ((request.bodyType ?? "json") !== "json" || request.body === undefined) {
    return { request, formatted: false }
  }
  const body = formatJson(request.body)
  return {
    request: body === request.body ? request : { ...request, body },
    formatted: body !== request.body,
  }
}

function formatItems(items: CollectionItem[]): {
  items: CollectionItem[]
  formattedJsonBodies: number
} {
  let formattedJsonBodies = 0
  const formattedItems = items.map((item): CollectionItem => {
    if (item.type === "request") {
      const formatted = formatRequest(item.data)
      if (formatted.formatted) formattedJsonBodies++
      return { type: "request", data: formatted.request }
    }
    const children = formatItems(item.data.children)
    formattedJsonBodies += children.formattedJsonBodies
    return {
      type: "folder",
      data: { ...item.data, children: children.items },
    }
  })
  return { items: formattedItems, formattedJsonBodies }
}

function importPaths(
  items: CollectionItem[],
  environments: Environment[],
): string[] {
  const paths: string[] = []
  const visit = (children: CollectionItem[]) => {
    for (const item of children) {
      if (item.type === "request") {
        paths.push(`${item.data.id}.yml`)
      } else {
        paths.push(posix.join(item.data.path, "folder.yml"))
        visit(item.data.children)
      }
    }
  }
  visit(items)
  for (const environment of environments) {
    paths.push(posix.join(".environments", `${environment.name}.env`))
  }
  return paths
}

function validateEnvironmentNames(environments: Environment[]): void {
  for (const environment of environments) {
    if (
      !environment.name ||
      environment.name.includes("..") ||
      environment.name.includes("/") ||
      environment.name.includes("\\")
    ) {
      throw new Error(`invalid imported environment name "${environment.name}"`)
    }
  }
}

function validateImportPath(root: string, path: string): void {
  const target = resolve(root, path)
  const rel = relative(resolve(root), target)
  if (
    !path ||
    path.includes("\\") ||
    rel === ".." ||
    rel.startsWith(`..${sep}`)
  ) {
    throw new Error(`invalid imported path "${path}"`)
  }
}

function findConflicts(
  root: string,
  paths: string[],
  checkExisting: boolean,
): string[] {
  const conflicts = new Set<string>()
  const planned = new Set<string>()
  for (const path of paths) {
    validateImportPath(root, path)
    if (planned.has(path)) conflicts.add(path)
    planned.add(path)
    if (checkExisting && existsSync(join(root, path))) conflicts.add(path)

    let parent = dirname(path)
    while (parent !== ".") {
      const parentPath = join(root, parent)
      if (
        checkExisting &&
        existsSync(parentPath) &&
        !statSync(parentPath).isDirectory()
      ) {
        conflicts.add(parent)
      }
      parent = dirname(parent)
    }
  }
  return [...conflicts].sort()
}

function validateCollectionId(id: string): void {
  if (
    !id ||
    id === "." ||
    id.includes("..") ||
    id.includes("/") ||
    id.includes("\\")
  ) {
    throw new Error(`invalid imported collection id "${id}"`)
  }
}

export type ImportDestination =
  | { kind: "current"; collectionDir: string }
  | { kind: "new"; parentDir: string }

export interface ImportOptions {
  source: string
  format?: string
  outputDir?: string
  silent?: boolean
  destination?: ImportDestination
}

let _importersRegistered = false

export async function runImport(
  options: ImportOptions,
): Promise<{ path: string; name: string; formattedJsonBodies: number }> {
  if (!_importersRegistered) {
    const { openApiImporter } = await import("../converters/openapi/index")
    const { swaggerImporter } = await import("../converters/swagger/index")
    const { postmanImporter } = await import("../converters/postman/index")
    const { insomniaImporter } = await import("../converters/insomnia/index")
    registerImporter(openApiImporter)
    registerImporter(swaggerImporter)
    registerImporter(postmanImporter)
    registerImporter(insomniaImporter)
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

  const formatted = formatItems(result.collection.items)
  validateEnvironmentNames(result.environments)
  result = {
    ...result,
    collection: { ...result.collection, items: formatted.items },
  }

  let collDir: string
  let overwrite = true
  const plannedPaths = importPaths(result.collection.items, result.environments)
  if (options.destination?.kind === "current") {
    collDir = options.destination.collectionDir
    if (!existsSync(collDir) || !statSync(collDir).isDirectory()) {
      throw new Error(`import target is not a directory: ${collDir}`)
    }
    overwrite = false
    const conflicts = findConflicts(collDir, plannedPaths, true)
    if (conflicts.length > 0) {
      throw new Error(`import conflicts:\n${conflicts.join("\n")}`)
    }
  } else if (options.destination?.kind === "new") {
    validateCollectionId(result.collection.id)
    const parentDir = options.destination.parentDir
    if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) {
      throw new Error(`import parent is not a directory: ${parentDir}`)
    }
    collDir = join(parentDir, result.collection.id)
    if (existsSync(collDir)) {
      throw new Error(`import target already exists: ${collDir}`)
    }
    const conflicts = findConflicts(collDir, plannedPaths, false)
    if (conflicts.length > 0) {
      throw new Error(`import conflicts:\n${conflicts.join("\n")}`)
    }
  } else {
    collDir = join(outputDir, result.collection.id)
  }

  for (const path of plannedPaths) {
    validateImportPath(collDir, path)
  }

  let removePartialImport = false
  const initializeCollectionId = options.destination?.kind !== "current"
  try {
    if (options.destination?.kind === "new") {
      await mkdir(collDir)
      removePartialImport = true
    }

    try {
      await writeCollection(collDir, result.collection, overwrite)
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
          overwrite ? "utf8" : { encoding: "utf8", flag: "wx" },
        )
      }
    }

    if (initializeCollectionId) {
      const settings = await loadSettings(collDir)
      await saveSettings(collDir, {
        ...settings,
        collectionId: settings.collectionId ?? randomUUID(),
      })
    }
  } catch (e) {
    if (removePartialImport) {
      try {
        await rm(collDir, { recursive: true, force: true })
      } catch (cleanupError) {
        const message = e instanceof Error ? e.message : String(e)
        const cleanupMessage =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        throw new Error(
          `${message}; failed to clean up partial import: ${cleanupMessage}`,
          { cause: cleanupError },
        )
      }
    }
    throw e
  }

  if (!options.silent)
    process.stdout.write(`Imported ${result.collection.name} → ${collDir}\n`)
  return {
    path: collDir,
    name: result.collection.name,
    formattedJsonBodies: formatted.formattedJsonBodies,
  }
}
