import type {
  AuditIssue,
  CollectionInspectResult,
  CollectionListResult,
  CollectionRunResult,
  CollectionTreeItem,
  RequestRunResult,
  WorkspaceAuditResult,
} from "./services"

type Color = "red" | "green" | "yellow" | "cyan" | "dim"

function colorsEnabled(): boolean {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR)
}

function color(text: string, value: Color): string {
  if (!colorsEnabled()) return text
  const code = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 2 }[value]
  return `\x1b[${code}m${text}\x1b[0m`
}

function statusLabel(result: RequestRunResult): string {
  if (result.error) return color("ERROR", "red")
  const status = result.response!.status
  const label = `${status} ${result.response!.statusText}`
  return color(label, status < 400 ? "green" : "red")
}

function formatAssertions(result: RequestRunResult): string[] {
  if (!result.assertions) return []
  if (!result.assertions.evaluated) return ["  Assertions: not evaluated"]
  const passed = result.assertions.results.filter(
    (assertion) => assertion.passed,
  ).length
  const failed = result.assertions.results.length - passed
  return [
    `  Assertions: ${passed} passed, ${failed} failed`,
    ...result.assertions.results.map(
      (assertion) =>
        `    ${assertion.passed ? color("✓", "green") : color("✗", "red")} ${assertion.expression} ${assertion.operator}${assertion.passed ? "" : `: ${assertion.message}`}`,
    ),
  ]
}

function formatCaptures(result: RequestRunResult): string[] {
  if (!result.captures) return []
  if (!result.captures.evaluated) return ["  Captures: not evaluated"]
  const captured = result.captures.results.filter(
    (capture) => capture.success,
  ).length
  const failed = result.captures.results.length - captured
  return [
    `  Captures: ${captured} captured, ${failed} failed`,
    ...result.captures.results.map(
      (capture) =>
        `    ${capture.success ? color("✓", "green") : color("✗", "red")} $${capture.variable} <- ${capture.expression}${capture.success ? "" : `: ${capture.message}`}`,
    ),
  ]
}

function formatTree(items: CollectionTreeItem[], prefix = ""): string[] {
  return items.flatMap((item, index) => {
    const last = index === items.length - 1
    const branch = `${prefix}${last ? "└─" : "├─"}`
    const childPrefix = `${prefix}${last ? "  " : "│ "}`
    if (item.type === "folder")
      return [
        `${branch} ${color(item.name, "cyan")}`,
        ...formatTree(item.children, childPrefix),
      ]
    return [
      `${branch} ${color(item.method, "cyan")} ${item.name} ${color(item.url, "dim")}`,
    ]
  })
}

export function formatWorkspaceList(data: { collections: string[] }): string {
  if (data.collections.length === 0) return "No registered collections."
  return [
    `Collections (${data.collections.length})`,
    ...data.collections.map((path) => `  ${path}`),
  ].join("\n")
}

export function formatWorkspaceAudit(data: WorkspaceAuditResult): string {
  if (data.collections.length === 0 && data.issues.length === 0)
    return "No registered collections."
  if (data.issues.length === 0)
    return `${color("✓", "green")} All registered collections are valid`
  const fixed = data.issues.filter((issue) => issue.fixed).length
  const headline = data.valid
    ? `${color("✓", "green")} Removed ${fixed} invalid collection${fixed === 1 ? "" : "s"}`
    : `${color("✗", "red")} Found ${data.issues.length} invalid collection${data.issues.length === 1 ? "" : "s"}`
  return [
    headline,
    ...data.issues.map(
      (issue) =>
        `  ${issue.fixed ? color("removed", "green") : color("error", "red")} ${issue.path}: ${issue.message}`,
    ),
  ].join("\n")
}

export function formatCollectionCreate(data: {
  path: string
  name: string
}): string {
  return `${color("✓", "green")} Created collection ${data.name}\n  ${data.path}`
}

export function formatCollectionInit(data: { path: string }): string {
  return `${color("✓", "green")} Initialized collection\n  ${data.path}`
}

export function formatCollectionList(data: CollectionListResult): string {
  if (data.tree.length === 0) return `Collection is empty: ${data.path}`
  return [`Collection: ${data.path}`, ...formatTree(data.tree)].join("\n")
}

export function formatCollectionInspect(data: CollectionInspectResult): string {
  const activeEnvironment = data.settings.environment ?? "none"
  return [
    `Collection: ${data.path}`,
    `Requests: ${data.requestCount}  Folders: ${data.folderCount}`,
    `Environment: ${activeEnvironment}`,
    `Available environments: ${data.environments.join(", ") || "none"}`,
    ...(data.tree.length ? ["", ...formatTree(data.tree)] : []),
  ].join("\n")
}

export function formatCollectionFormat(data: {
  path: string
  requestCount: number
  formattedJsonBodies: number
}): string {
  const jsonBodies = data.formattedJsonBodies
  return [
    `${color("✓", "green")} Formatted ${data.requestCount} request${data.requestCount === 1 ? "" : "s"}`,
    `  ${data.path}`,
    `  Pretty-printed ${jsonBodies} JSON bod${jsonBodies === 1 ? "y" : "ies"}`,
  ].join("\n")
}

export function formatCollectionAudit(data: {
  path: string
  valid: boolean
  issues: AuditIssue[]
}): string {
  if (data.issues.length === 0)
    return `${color("✓", "green")} Collection is valid\n  ${data.path}`
  const fixed = data.issues.filter((issue) => issue.fixed).length
  const headline = data.valid
    ? `${color("✓", "green")} Fixed ${fixed} issue${fixed === 1 ? "" : "s"}`
    : `${color("✗", "red")} Found ${data.issues.length} issue${data.issues.length === 1 ? "" : "s"}`
  return [
    headline,
    `  ${data.path}`,
    ...data.issues.map(
      (issue) =>
        `  ${issue.fixed ? color("fixed", "green") : color("error", "red")} ${issue.kind} ${issue.path}: ${issue.message}`,
    ),
  ].join("\n")
}

export function formatRunResult(result: RequestRunResult): string {
  const duration = result.response ? `  ${result.response.timeMs}ms` : ""
  return [
    `${result.ok ? color("✓", "green") : color("✗", "red")} ${color(result.method, "cyan")} ${result.id}  ${statusLabel(result)}${duration}`,
    `  ${result.url}${result.error ? `\n  ${color(result.error, "red")}` : ""}`,
    ...formatCaptures(result),
    ...formatAssertions(result),
    ...(result.warnings ?? []).map(
      (warning) => `  ${color("warning", "yellow")}: ${warning}`,
    ),
  ].join("\n")
}

export function formatRequestRun(data: { result: RequestRunResult }): string {
  return formatRunResult(data.result)
}

export function formatCollectionRun(data: CollectionRunResult): string {
  const summary = data.summary
  return [
    ...data.results.flatMap((result) => formatRunResult(result).split("\n")),
    ...data.skipped.map(
      (request) => `- ${request.id}  skipped (${request.reason})`,
    ),
    ...(data.failure
      ? [`${color("error", "red")}: ${data.failure.message}`]
      : []),
    "",
    `Summary: ${color(`${summary.requestSuccesses} passed`, "green")}, ${summary.requestFailures ? color(`${summary.requestFailures} failed`, "red") : "0 failed"}, ${summary.executed}/${summary.selected} executed, ${summary.skipped} skipped, ${summary.durationMs}ms`,
    `Assertions: ${summary.assertionPasses} passed, ${summary.assertionFailures} failed`,
    `Capture failures: ${summary.captureFailures}`,
    ...(summary.failureCategories.length
      ? [`Failure categories: ${summary.failureCategories.join(", ")}`]
      : []),
    ...(data.warnings ?? []).map(
      (warning) => `${color("warning", "yellow")}: ${warning}`,
    ),
  ].join("\n")
}

export function formatRequestCreate(data: {
  id: string
  path: string
}): string {
  return `${color("✓", "green")} Created request ${data.id}\n  ${data.path}`
}

export function formatEnvironmentSet(data: {
  environment: string
  key: string
}): string {
  return `${color("✓", "green")} Set ${data.key} in ${data.environment}`
}

export function formatSecretSet(data: {
  environment: string
  key: string
}): string {
  return `${color("✓", "green")} Stored ${data.key} securely for ${data.environment}`
}

export function formatSecretList(data: {
  environment: string
  secrets: { key: string; enabled: boolean; status: string }[]
}): string {
  if (data.secrets.length === 0) {
    return `No secrets declared in ${data.environment}.`
  }
  return [
    `Secrets in ${data.environment}`,
    ...data.secrets.map(
      (secret) =>
        `  ${secret.enabled ? "●" : "○"} ${secret.key}  ${color(secret.status, secret.status === "missing" ? "yellow" : "dim")}`,
    ),
  ].join("\n")
}

export function formatSecretDelete(data: {
  environment: string
  key: string
  deleted: boolean
}): string {
  return data.deleted
    ? `${color("✓", "green")} Removed the local value for ${data.key} in ${data.environment}`
    : `No local value was stored for ${data.key} in ${data.environment}`
}

export function formatImport(data: {
  path: string
  name: string
  formattedJsonBodies?: number
}): string {
  return [
    `${color("✓", "green")} Imported ${data.name}`,
    `  ${data.path}`,
    ...(data.formattedJsonBodies === undefined
      ? []
      : [
          `  Pretty-printed ${data.formattedJsonBodies} JSON bod${data.formattedJsonBodies === 1 ? "y" : "ies"}`,
        ]),
  ].join("\n")
}

export function formatExport(data: {
  path: string
  name: string
  format: string
  operationCount: number
  environmentCount?: number
}): string {
  const isPostman = data.format === "postman"
  const noun = isPostman ? "request" : "operation"
  return [
    `${color("✓", "green")} Exported ${data.name} as ${data.format}`,
    `  ${isPostman ? "Bundle" : "Output"}: ${data.path}`,
    `  ${data.operationCount} ${noun}${data.operationCount === 1 ? "" : "s"}`,
    ...(data.environmentCount === undefined
      ? []
      : [
          `  ${data.environmentCount} environment${data.environmentCount === 1 ? "" : "s"}`,
        ]),
  ].join("\n")
}

export interface RunProgressReporter {
  update(completed: number, total: number): void
  finish(): void
}

export function createRunProgressReporter(): RunProgressReporter | undefined {
  if (!process.stderr.isTTY) return undefined
  let active = false
  return {
    update(completed, total) {
      active = true
      process.stderr.write(
        `\r\x1b[2K${color("Running requests", "cyan")} ${completed}/${total}`,
      )
    },
    finish() {
      if (!active) return
      process.stderr.write("\r\x1b[2K")
      active = false
    },
  }
}

export function formatCookieList(data: {
  disabled: boolean
  state: string
  warnings: string[]
  cookies: {
    name: string
    value: string
    domain: string
    path: string
    expires: string | null
    secure: boolean
    httpOnly: boolean
    hostOnly: boolean
    sameSite?: "strict" | "lax" | "none"
  }[]
}): string {
  if (data.disabled) return "The cookie jar is disabled for this collection."
  if (data.cookies.length === 0)
    return [
      "The cookie jar is empty.",
      ...data.warnings.map(
        (warning) => `${color("warning", "yellow")}: ${warning}`,
      ),
    ].join("\n")
  const domains = new Map<string, typeof data.cookies>()
  for (const cookie of data.cookies) {
    const group = domains.get(cookie.domain) ?? []
    group.push(cookie)
    domains.set(cookie.domain, group)
  }
  const lines: string[] = []
  for (const [domain, cookies] of domains) {
    lines.push(domain)
    for (const cookie of cookies) {
      const flags = [
        cookie.hostOnly ? "HostOnly" : "Domain",
        cookie.httpOnly ? "HttpOnly" : "",
        cookie.secure ? "Secure" : "",
        cookie.sameSite ?? "",
      ]
        .filter(Boolean)
        .join(" ")
      const expires =
        cookie.expires === null ? "session" : cookie.expires.slice(0, 10)
      lines.push(
        `  ${cookie.name} = ${cookie.value}  path=${cookie.path}  expires=${expires}${flags ? `  ${flags}` : ""}`,
      )
    }
  }
  return [
    `Storage: ${data.state}`,
    ...data.warnings.map(
      (warning) => `${color("warning", "yellow")}: ${warning}`,
    ),
    ...lines,
  ].join("\n")
}

export function formatCookieClear(data: {
  disabled: boolean
  state: string
  warnings: string[]
  backupPath?: string
}): string {
  if (data.disabled) return "The cookie jar is disabled for this collection."
  return [
    "Cookie jar cleared.",
    ...(data.backupPath ? [`Backup: ${data.backupPath}`] : []),
    ...data.warnings.map(
      (warning) => `${color("warning", "yellow")}: ${warning}`,
    ),
  ].join("\n")
}
