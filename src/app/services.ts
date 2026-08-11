import { existsSync } from "node:fs"
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { load as yamlLoad } from "js-yaml"
import { loadConfig, saveConfig, upsertCollectionPath } from "../config"
import { env } from "../env"
import {
  filestore,
  loadSettings,
  parseCollectionSettings,
  saveRequest,
  saveSettings,
  ensureCollectionBootstrapped,
  redactTimelineSecrets,
} from "../filestore"
import { formatJson } from "../lang/formatJson"
import { lang } from "../lang"
import { executor, substitute } from "../requests"
import { withDefaultHttpsScheme } from "../requests/url"
import {
  resolveProxyPolicy,
  takeSystemProxyFromEnv,
  type ProxyPolicy,
  type SystemProxySettings,
} from "../proxy"
import type { TlsPolicy } from "../tls"
import type {
  Collection,
  CollectionItem,
  CollectionSettings,
  Environment,
  Request,
} from "../schema"
import {
  deleteStoredSecret,
  ensureCollectionId,
  getStoredSecret,
  loadAppProxyCredentials,
  loadCollectionProxyCredentials,
  loadTlsPassphrases,
  setStoredSecret,
} from "../secrets"
import { environmentSecretValues, redactKnownSecrets } from "../secrets/redact"

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
export type CollectionTreeItem =
  | {
      type: "request"
      id: string
      name: string
      method: Request["method"]
      url: string
    }
  | {
      type: "folder"
      path: string
      name: string
      children: CollectionTreeItem[]
    }

export interface CollectionListResult {
  path: string
  tree: CollectionTreeItem[]
}
export interface CollectionInspectResult {
  path: string
  requestCount: number
  folderCount: number
  environments: string[]
  settings: CollectionSettings
  tree: CollectionTreeItem[]
}
export function collectionTree(items: CollectionItem[]): CollectionTreeItem[] {
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
export interface WorkspaceAuditIssue {
  path: string
  message: string
  fixed: boolean
}
export interface WorkspaceAuditResult {
  valid: boolean
  collections: string[]
  issues: WorkspaceAuditIssue[]
}
export async function workspaceAudit(
  fix: boolean,
  configDir = CONFIG_DIR,
): Promise<WorkspaceAuditResult> {
  const config = loadConfig(configDir)
  const issues: WorkspaceAuditIssue[] = []
  const validCollections: string[] = []

  for (const path of config.collections) {
    let pathStat
    try {
      pathStat = await stat(path)
    } catch {
      issues.push({
        path,
        message: "directory does not exist",
        fixed: fix,
      })
      continue
    }
    if (!pathStat.isDirectory()) {
      issues.push({
        path,
        message: "not a directory",
        fixed: fix,
      })
      continue
    }
    let collectionRoot
    try {
      collectionRoot = await isCollectionRoot(path)
    } catch {
      issues.push({
        path,
        message: "not accessible",
        fixed: fix,
      })
      continue
    }
    if (!collectionRoot) {
      issues.push({
        path,
        message: "not a collection root",
        fixed: fix,
      })
      continue
    }
    validCollections.push(path)
  }

  if (fix && issues.length > 0)
    saveConfig(configDir, {
      ...config,
      collections: validCollections,
    })

  return {
    valid: issues.every((issue) => issue.fixed),
    collections: fix ? validCollections : config.collections,
    issues,
  }
}
export async function collectionCreate(
  name: string,
  output: string,
): Promise<{ path: string; name: string }> {
  validateCollectionName(name)
  const path = resolve(output, name)
  if (existsSync(path)) throw new Error(`collection already exists: ${path}`)
  await mkdir(join(path, ".environments"), { recursive: true })
  await saveSettings(path, {
    collectionId: randomUUID(),
    environment: "development",
  })
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

export async function collectionInit(
  path: string,
  configDir = CONFIG_DIR,
): Promise<{ path: string }> {
  const absolutePath = resolve(path)
  if (!existsSync(absolutePath)) {
    throw new Error(`directory not found: ${absolutePath}`)
  }
  if (!(await isDirectory(absolutePath))) {
    throw new Error(`not a directory: ${absolutePath}`)
  }
  if (await isCollectionRoot(absolutePath)) {
    throw new Error(`already a collection: ${absolutePath}`)
  }

  await ensureCollectionBootstrapped(absolutePath)
  const config = loadConfig(configDir)
  saveConfig(configDir, {
    ...config,
    collections: upsertCollectionPath(config.collections, absolutePath),
  })
  return { path: absolutePath }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
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
): Promise<CollectionListResult> {
  const absolutePath = resolve(path)
  if (!(await isCollectionRoot(absolutePath))) {
    return { path: absolutePath, tree: [] }
  }
  const collection = await filestore.loadCollection(absolutePath)
  return { path: absolutePath, tree: collectionTree(collection.items) }
}
export async function collectionInspect(
  path: string,
): Promise<CollectionInspectResult> {
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

export interface CollectionFormatResult {
  path: string
  requestCount: number
  formattedJsonBodies: number
}

function formatJsonBody(request: Request): Request {
  if ((request.bodyType ?? "json") !== "json" || request.body === undefined)
    return request
  return {
    ...request,
    body: formatJson(request.body),
  }
}

export async function collectionFormat(
  path: string,
): Promise<CollectionFormatResult> {
  const absolutePath = await requireCollectionRoot(path)
  const collection = await filestore.loadCollection(absolutePath)
  const requests = flattenRequests(collection.items)
  let formattedJsonBodies = 0

  for (const request of requests) {
    const formatted = formatJsonBody(request)
    if (formatted.body !== request.body) formattedJsonBodies++
    await saveRequest(absolutePath, formatted)
  }

  return {
    path: absolutePath,
    requestCount: requests.length,
    formattedJsonBodies,
  }
}

export interface AuditIssue {
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
      const settings = content.trim()
        ? parseCollectionSettings(yamlLoad(content))
        : {}
      if (fix) {
        await saveSettings(root, settings)
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
        { resolveSecrets: false },
      )
      if (fix) {
        if (Object.keys(parsed.secretVars ?? {}).length > 0) {
          await ensureCollectionId(root)
        }
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
  settings: CollectionSettings,
  name?: string,
): Promise<Environment | undefined> {
  const environmentName = name ?? settings.environment
  return environmentName
    ? env.loadEnvironment(join(dir, ".environments"), environmentName)
    : undefined
}
export interface RequestRunResult {
  id: string
  method: Request["method"]
  url: string
  ok: boolean
  response?: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    timeMs: number
  }
  error?: string
}
export interface CollectionRunResult {
  results: RequestRunResult[]
  failed: boolean
}
export type RunProgress = (completed: number, total: number) => void

async function runRequest(
  collection: Collection,
  request: Request,
  environment?: Environment,
  proxyPolicy?: ProxyPolicy,
  tlsPolicy?: TlsPolicy,
): Promise<RequestRunResult> {
  const secretValues = [
    ...environmentSecretValues(environment),
    ...(proxyPolicy?.kind === "custom"
      ? Object.values(proxyPolicy.credentials ?? {})
      : []),
    ...Object.values(tlsPolicy?.passphrases ?? {}),
  ].filter((value): value is string => Boolean(value))
  const redact = (value: string) => redactKnownSecrets(value, secretValues)
  try {
    const response = await executor.send(request, {
      environment,
      collection,
      requestPath: request.id,
      proxyPolicy,
      tlsPolicy,
    })
    const effective = environment ? substitute(request, environment) : request
    return {
      id: request.id,
      method: request.method,
      url: redact(effective.url),
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
      url: redact(request.url),
      error: redact(errorMessage(error)),
      ok: false,
    }
  }
}
export async function collectionRun(
  path: string,
  environmentName?: string,
  onProgress?: RunProgress,
  noProxy = false,
  systemProxy?: SystemProxySettings,
  insecure = false,
): Promise<CollectionRunResult> {
  const dir = await requireCollectionRoot(path)
  const settings = await loadSettings(dir)
  const collection = await filestore.loadCollection(dir)
  const environment = await environmentFor(dir, settings, environmentName)
  const policy = await proxyPolicyFor(
    dir,
    settings,
    noProxy,
    systemProxy ?? takeSystemProxyFromEnv(),
  )
  const tlsPolicy = await tlsPolicyFor(dir, settings, insecure)
  const requests = flattenRequests(collection.items)
  const results: RequestRunResult[] = []
  onProgress?.(0, requests.length)
  for (const request of requests) {
    results.push(
      await runRequest(collection, request, environment, policy, tlsPolicy),
    )
    onProgress?.(results.length, requests.length)
  }
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
  new URL(withDefaultHttpsScheme(url))
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
  onProgress?: RunProgress,
  noProxy = false,
  systemProxy?: SystemProxySettings,
  insecure = false,
): Promise<{ result: RequestRunResult; failed: boolean }> {
  validateId(id)
  const dir = await requireCollectionRoot(collectionDir)
  const settings = await loadSettings(dir)
  const collection = await filestore.loadCollection(dir)
  const request = flattenRequests(collection.items).find(
    (item) => item.id === id,
  )
  if (!request) throw new Error(`request not found: ${id}`)
  onProgress?.(0, 1)
  const result = await runRequest(
    collection,
    request,
    await environmentFor(dir, settings, environmentName),
    await proxyPolicyFor(
      dir,
      settings,
      noProxy,
      systemProxy ?? takeSystemProxyFromEnv(),
    ),
    await tlsPolicyFor(dir, settings, insecure),
  )
  onProgress?.(1, 1)
  return { result, failed: result.ok === false }
}

async function tlsPolicyFor(
  dir: string,
  settings: CollectionSettings,
  insecure: boolean,
): Promise<TlsPolicy> {
  const passphrases = await loadTlsPassphrases(dir, settings.tls)
  return {
    collectionDir: dir,
    settings: settings.tls,
    insecure,
    ...(Object.keys(passphrases).length > 0 ? { passphrases } : {}),
  }
}

async function proxyPolicyFor(
  dir: string,
  settings: CollectionSettings,
  noProxy: boolean,
  systemProxy: SystemProxySettings,
): Promise<ProxyPolicy> {
  const appProxy = loadConfig(CONFIG_DIR).proxy
  const policy = resolveProxyPolicy({
    noProxy,
    appProxy,
    collectionProxy: settings.proxy,
    systemProxy,
  })
  if (policy.kind !== "custom" || !policy.auth) return policy
  const credentials =
    policy.source === "collection"
      ? await loadCollectionProxyCredentials(dir, settings.proxy)
      : await loadAppProxyCredentials(appProxy)
  return { ...policy, credentials }
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
  const current = await env.loadEnvironment(dir, name, {
    resolveSecrets: false,
  })
  if (current.secretVars?.[key]) {
    throw new Error(
      `"${key}" is a secret; use "noodle secret set ${key} --env ${name}"`,
    )
  }
  const disabled = { ...(current.disabledVars ?? {}) }
  delete disabled[key]
  await env.saveEnvironment(dir, {
    ...current,
    vars: { ...current.vars, [key]: value },
    disabledVars: Object.keys(disabled).length ? disabled : undefined,
  })
  return { environment: name, key }
}

export interface SecretListItem {
  key: string
  enabled: boolean
  status: "process" | "keychain" | "missing" | "disabled"
}

function validateSecretKey(key: string): void {
  if (!/^\w+$/.test(key)) {
    throw new Error(
      `invalid secret key "${key}"; expected letters, numbers, or _`,
    )
  }
}

export async function secretSet(
  key: string,
  value: string,
  name: string,
  collectionDir: string,
): Promise<{ environment: string; key: string; status: "stored" }> {
  validateSecretKey(key)
  if (!value) throw new Error("secret value must not be empty")
  const collectionRoot = await requireCollectionRoot(collectionDir)
  const directory = join(collectionRoot, ".environments")
  const current = await env.loadEnvironment(directory, name, {
    resolveSecrets: false,
  })
  const oldPlaintext = current.vars[key] ?? current.disabledVars?.[key]
  if (oldPlaintext) await redactTimelineSecrets(collectionRoot, [oldPlaintext])

  const previous = await getStoredSecret(collectionRoot, name, key)
  await setStoredSecret(collectionRoot, name, key, value)
  const wasDisabled =
    current.secretVars?.[key] === "disabled" ||
    Object.hasOwn(current.disabledVars ?? {}, key)
  const vars = { ...current.vars }
  const disabledVars = { ...(current.disabledVars ?? {}) }
  delete vars[key]
  delete disabledVars[key]
  try {
    await env.saveEnvironment(directory, {
      ...current,
      vars,
      disabledVars: Object.keys(disabledVars).length ? disabledVars : undefined,
      secretVars: {
        ...(current.secretVars ?? {}),
        [key]: wasDisabled ? "disabled" : "keychain",
      },
    })
  } catch (error) {
    if (previous) await setStoredSecret(collectionRoot, name, key, previous)
    else await deleteStoredSecret(collectionRoot, name, key).catch(() => false)
    throw error
  }
  return { environment: name, key, status: "stored" }
}

export async function secretList(
  name: string,
  collectionDir: string,
): Promise<{ environment: string; secrets: SecretListItem[] }> {
  const collectionRoot = await requireCollectionRoot(collectionDir)
  const current = await env.loadEnvironment(
    join(collectionRoot, ".environments"),
    name,
  )
  return {
    environment: name,
    secrets: Object.entries(current.secretVars ?? {})
      .map(([key, status]) => ({
        key,
        enabled: status !== "disabled",
        status,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  }
}

export async function secretDelete(
  key: string,
  name: string,
  collectionDir: string,
): Promise<{ environment: string; key: string; deleted: boolean }> {
  validateSecretKey(key)
  const collectionRoot = await requireCollectionRoot(collectionDir)
  const current = await env.loadEnvironment(
    join(collectionRoot, ".environments"),
    name,
    { resolveSecrets: false },
  )
  if (!current.secretVars?.[key]) {
    throw new Error(`secret "${key}" is not declared in ${name}`)
  }
  const deleted = await deleteStoredSecret(collectionRoot, name, key)
  return { environment: name, key, deleted }
}
