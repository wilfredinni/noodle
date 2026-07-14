import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import * as yaml from "js-yaml"
import { loadConfig, saveConfig, upsertCollectionPath } from "../config"
import { env } from "../env"
import {
  filestore,
  loadSettings,
  saveRequest,
  saveSettings,
} from "../filestore"
import { lang } from "../lang"
import { executor, substitute } from "../requests"
import type {
  Collection,
  CollectionItem,
  Environment,
  Request,
} from "../schema"

const CONFIG_DIR = join(process.env.HOME ?? "~", ".config/noodle")
const SKIP_DIRS = new Set([".noodle", ".timeline", ".git", "node_modules"])

export interface CliError {
  path?: string
  message: string
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
export function validateId(id: string): void {
  if (
    !id ||
    id === "." ||
    id.startsWith("./") ||
    id.startsWith("/") ||
    id.includes("..") ||
    id.includes("\\")
  )
    throw new Error(`invalid request id "${id}"`)
  if (id.split("/").some((segment) => !segment || segment.startsWith(".")))
    throw new Error(`invalid request id "${id}"`)
}
export function validateCollectionName(name: string): void {
  if (
    !name.trim() ||
    name === "." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..")
  )
    throw new Error(`invalid collection name "${name}"`)
}
export function flattenRequests(items: CollectionItem[]): Request[] {
  return items.flatMap((item) =>
    item.type === "request" ? [item.data] : flattenRequests(item.data.children),
  )
}
export function collectionTree(items: CollectionItem[]): unknown[] {
  return items.map((item) =>
    item.type === "request"
      ? {
          type: "request",
          id: item.data.id,
          name: item.data.name,
          method: item.data.method,
          url: item.data.url,
        }
      : {
          type: "folder",
          path: item.data.path,
          name: item.data.name,
          children: collectionTree(item.data.children),
        },
  )
}

export async function workspaceList(): Promise<{ collections: string[] }> {
  return { collections: loadConfig(CONFIG_DIR).collections }
}
export async function collectionCreate(
  name: string,
  output: string,
): Promise<{ path: string; name: string }> {
  validateCollectionName(name)
  const path = resolve(output, name)
  if (existsSync(path)) throw new Error(`collection already exists: ${path}`)
  await mkdir(join(path, ".environments"), { recursive: true })
  await saveSettings(path, { environment: "development" })
  await env.saveEnvironment(join(path, ".environments"), {
    name: "development",
    vars: {},
  })
  await saveRequest(path, {
    id: "example",
    name: "Example",
    method: "GET",
    url: "https://example.com",
    timeout: 30000,
    headers: {},
    params: [],
  })
  const config = loadConfig(CONFIG_DIR)
  saveConfig(CONFIG_DIR, {
    ...config,
    collections: upsertCollectionPath(config.collections, path),
  })
  return { path, name }
}

async function isCollectionRoot(path: string): Promise<boolean> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.some((entry) => {
    if (entry.name === "settings.yml" || entry.name === ".environments") {
      return true
    }
    return (
      entry.isFile() &&
      entry.name.endsWith(".yml") &&
      entry.name !== "folder.yml"
    )
  })
}

async function requireCollectionRoot(path: string): Promise<string> {
  const absolutePath = resolve(path)
  if (!(await isCollectionRoot(absolutePath))) {
    throw new Error(`not a collection root: ${absolutePath}`)
  }
  return absolutePath
}

export async function collectionList(
  path: string,
): Promise<{ path: string; tree: unknown[] }> {
  const absolutePath = resolve(path)
  if (!(await isCollectionRoot(absolutePath))) {
    return { path: absolutePath, tree: [] }
  }
  const collection = await filestore.loadCollection(absolutePath)
  return { path: absolutePath, tree: collectionTree(collection.items) }
}
export async function collectionInspect(
  path: string,
): Promise<Record<string, unknown>> {
  const absolutePath = await requireCollectionRoot(path)
  const collection = await filestore.loadCollection(absolutePath)
  const requests = flattenRequests(collection.items)
  const countFolders = (items: CollectionItem[]): number =>
    items.reduce(
      (n, item) =>
        n + (item.type === "folder" ? 1 + countFolders(item.data.children) : 0),
      0,
    )
  return {
    path: absolutePath,
    requestCount: requests.length,
    folderCount: countFolders(collection.items),
    environments: await env.listEnvironments(
      join(absolutePath, ".environments"),
    ),
    settings: await loadSettings(absolutePath),
    tree: collectionTree(collection.items),
  }
}

interface AuditIssue {
  path: string
  kind: "request" | "folder" | "settings" | "environment"
  message: string
  fixed: boolean
}
async function auditFile(
  path: string,
  root: string,
  fix: boolean,
  issues: AuditIssue[],
): Promise<void> {
  const rel = relative(root, path)
  const name = basename(path)
  const content = await readFile(path, "utf8")
  try {
    if (name === "settings.yml") {
      const raw = yaml.load(content)
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw as object).some((key) => key !== "environment") ||
        ((raw as { environment?: unknown }).environment !== undefined &&
          typeof (raw as { environment?: unknown }).environment !== "string")
      )
        throw new Error(
          "expected settings mapping with optional string environment",
        )
      if (fix) {
        await saveSettings(root, {
          environment: (raw as { environment?: string }).environment,
        })
        issues.push({
          path: rel,
          kind: "settings",
          message: "canonicalized",
          fixed: true,
        })
      }
      return
    }
    if (name === "folder.yml") {
      const parsed = lang.parseFolder(content)
      if (fix) {
        const folderPath = relative(root, join(path, ".."))
        const id = basename(folderPath)
        await writeFile(
          path,
          lang.serializeFolder({
            id,
            name: parsed.meta?.name ?? id,
            path: folderPath,
            seq: parsed.meta?.seq,
            overrides: parsed.overrides,
            children: [],
          }),
          "utf8",
        )
        issues.push({
          path: rel,
          kind: "folder",
          message: "canonicalized",
          fixed: true,
        })
      }
      return
    }
    if (path.endsWith(".env")) {
      const parsed = await env.loadEnvironment(
        join(path, ".."),
        name.slice(0, -4),
      )
      if (fix) {
        await env.saveEnvironment(join(path, ".."), parsed)
        issues.push({
          path: rel,
          kind: "environment",
          message: "canonicalized",
          fixed: true,
        })
      }
      return
    }
    const id = rel.slice(0, -4)
    const request = lang.parseRequest(id, content)
    if (fix) {
      await saveRequest(root, request)
      issues.push({
        path: rel,
        kind: "request",
        message: "canonicalized",
        fixed: true,
      })
    }
  } catch (error) {
    issues.push({
      path: rel,
      kind: path.endsWith(".env")
        ? "environment"
        : name === "folder.yml"
          ? "folder"
          : name === "settings.yml"
            ? "settings"
            : "request",
      message: errorMessage(error),
      fixed: false,
    })
  }
}
export async function collectionAudit(
  path: string,
  fix: boolean,
): Promise<{ path: string; valid: boolean; issues: AuditIssue[] }> {
  const root = await realpath(resolve(path))
  await requireCollectionRoot(root)
  const issues: AuditIssue[] = []
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      const file = join(dir, entry.name)
      if (
        entry.name.endsWith(".env") &&
        relative(root, file).startsWith(".environments/")
      )
        await auditFile(file, root, fix, issues)
      else if (
        (entry.name === "settings.yml" &&
          file === join(root, "settings.yml")) ||
        (entry.name !== "settings.yml" &&
          (entry.name === "folder.yml" || entry.name.endsWith(".yml")))
      )
        await auditFile(file, root, fix, issues)
    }
  }
  await walk(root)
  return { path: root, valid: issues.every((issue) => issue.fixed), issues }
}

async function environmentFor(
  dir: string,
  name?: string,
): Promise<Environment | undefined> {
  const environmentName = name ?? (await loadSettings(dir)).environment
  return environmentName
    ? env.loadEnvironment(join(dir, ".environments"), environmentName)
    : undefined
}
async function runRequest(
  collection: Collection,
  dir: string,
  request: Request,
  environment?: Environment,
): Promise<Record<string, unknown>> {
  try {
    const response = await executor.send(
      request,
      environment,
      undefined,
      collection,
      request.id,
    )
    const effective = environment ? substitute(request, environment) : request
    return {
      id: request.id,
      method: request.method,
      url: effective.url,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.body,
        timeMs: response.timeMs,
      },
      ok: response.status < 400,
    }
  } catch (error) {
    return {
      id: request.id,
      method: request.method,
      url: request.url,
      error: errorMessage(error),
      ok: false,
    }
  }
}
export async function collectionRun(
  path: string,
  environmentName?: string,
): Promise<{ results: Record<string, unknown>[]; failed: boolean }> {
  const dir = await requireCollectionRoot(path)
  const collection = await filestore.loadCollection(dir)
  const environment = await environmentFor(dir, environmentName)
  const results = []
  for (const request of flattenRequests(collection.items))
    results.push(await runRequest(collection, dir, request, environment))
  return { results, failed: results.some((result) => result.ok === false) }
}
export async function requestCreate(
  id: string,
  url: string,
  method: Request["method"],
  collectionDir: string,
): Promise<{ id: string; path: string }> {
  validateId(id)
  if (!url) throw new Error("url is required")
  new URL(url)
  const dir = await requireCollectionRoot(collectionDir)
  const path = join(dir, `${id}.yml`)
  if (existsSync(path)) throw new Error(`request already exists: ${id}`)
  await saveRequest(dir, {
    id,
    name: basename(id),
    method,
    url,
    timeout: 30000,
    headers: {},
    params: [],
  })
  return { id, path }
}
export async function requestRun(
  id: string,
  collectionDir: string,
  environmentName?: string,
): Promise<{ result: Record<string, unknown>; failed: boolean }> {
  validateId(id)
  const dir = await requireCollectionRoot(collectionDir)
  const collection = await filestore.loadCollection(dir)
  const request = flattenRequests(collection.items).find(
    (item) => item.id === id,
  )
  if (!request) throw new Error(`request not found: ${id}`)
  const result = await runRequest(
    collection,
    dir,
    request,
    await environmentFor(dir, environmentName),
  )
  return { result, failed: result.ok === false }
}
export async function environmentSet(
  key: string,
  value: string,
  name: string,
  collectionDir: string,
): Promise<{ environment: string; key: string }> {
  if (!key.trim() || key.includes("="))
    throw new Error(`invalid environment key "${key}"`)
  const collectionRoot = await requireCollectionRoot(collectionDir)
  const dir = join(collectionRoot, ".environments")
  const current = await env.loadEnvironment(dir, name)
  const disabled = { ...(current.disabledVars ?? {}) }
  delete disabled[key]
  await env.saveEnvironment(dir, {
    ...current,
    vars: { ...current.vars, [key]: value },
    disabledVars: Object.keys(disabled).length ? disabled : undefined,
  })
  return { environment: name, key }
}
