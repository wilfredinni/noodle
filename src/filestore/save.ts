import { mkdir, writeFile, unlink, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import * as yaml from "js-yaml"
import { lang } from "../lang"
import type { CollectionSettings, Folder, Request } from "../schema"
import { collectionTlsToYaml } from "../tls"
import { env } from "../env"

function validatePathId(id: string | undefined): void {
  if (!id) {
    throw new Error("filestore.validatePathId: missing or invalid id")
  }
  if (id === "." || id.startsWith("./")) {
    throw new Error(
      'filestore.validatePathId: id must not be "." or start with "./"',
    )
  }
  if (id.startsWith("/")) {
    throw new Error("filestore.validatePathId: id must not be an absolute path")
  }
  if (id.includes("\\") || id.includes("..")) {
    throw new Error(
      'filestore.validatePathId: id must not contain backslash or ".."',
    )
  }
}

export async function saveRequest(
  dir: string,
  req: Request,
  options?: { overwrite?: boolean },
): Promise<void> {
  const id = (req as { id?: string }).id
  validatePathId(id)

  const filePath = join(dir, `${id}.yml`)
  const parentDir = dirname(filePath)

  try {
    await mkdir(parentDir, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveRequest: ${msg}`, { cause: e })
  }

  const yamlStr = lang.serializeRequest(req)

  try {
    await writeFile(filePath, yamlStr, {
      encoding: "utf8",
      flag: options?.overwrite === false ? "wx" : "w",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveRequest: ${msg}`, { cause: e })
  }
}

export async function deleteRequest(dir: string, id: string): Promise<void> {
  validatePathId(id)

  try {
    await unlink(join(dir, `${id}.yml`))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.deleteRequest: ${msg}`, { cause: e })
  }
}

export async function saveFolder(dir: string, folder: Folder): Promise<void> {
  validatePathId(folder.path)
  const folderDir = join(dir, folder.path)

  try {
    await mkdir(folderDir, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveFolder: ${msg}`, { cause: e })
  }

  const yamlStr = lang.serializeFolder(folder)

  try {
    await writeFile(join(folderDir, "folder.yml"), yamlStr, "utf8")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveFolder: ${msg}`, { cause: e })
  }
}

export async function deleteFolder(dir: string, path: string): Promise<void> {
  validatePathId(path)

  const folderDir = join(dir, path)
  try {
    await rm(folderDir, { recursive: true, force: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.deleteFolder: ${msg}`, { cause: e })
  }
}

export async function saveSettings(
  dir: string,
  settings: CollectionSettings,
): Promise<void> {
  if (
    settings.timelineMaxEntries !== undefined &&
    (!Number.isSafeInteger(settings.timelineMaxEntries) ||
      settings.timelineMaxEntries < 0)
  ) {
    throw new Error(
      "filestore.saveSettings: timeline max entries must be a non-negative integer",
    )
  }
  try {
    await mkdir(dir, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveSettings: ${msg}`, { cause: e })
  }

  const data: Record<string, unknown> = {}
  const name = settings.name?.trim()
  if (name) data.name = name
  const description = settings.description?.trim()
  if (description) data.description = description
  if (settings.timelineMaxEntries !== undefined) {
    data.timeline_max_entries = settings.timelineMaxEntries
  }
  if (settings.environment !== undefined) {
    data.environment = settings.environment
  }
  if (settings.proxy !== undefined) {
    data.proxy = settings.proxy
  }
  if (settings.tls !== undefined) {
    const tls = collectionTlsToYaml(settings.tls)
    if (Object.keys(tls).length > 0) data.tls = tls
  }

  try {
    await writeFile(join(dir, "settings.yml"), yaml.dump(data), "utf8")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveSettings: ${msg}`, { cause: e })
  }
}

export async function ensureCollectionBootstrapped(dir: string): Promise<void> {
  const envDir = join(dir, ".environments")
  const settingsPath = join(dir, "settings.yml")

  if (!existsSync(settingsPath)) {
    await saveSettings(dir, { environment: "development" })
  }
  if (!existsSync(envDir)) {
    await mkdir(envDir, { recursive: true })
    await env.saveEnvironment(envDir, { name: "development", vars: {} })
  }
}
