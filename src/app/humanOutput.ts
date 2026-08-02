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
  ].join("\n")
}

export function formatRequestRun(data: { result: RequestRunResult }): string {
  return formatRunResult(data.result)
}

export function formatCollectionRun(data: CollectionRunResult): string {
  const passed = data.results.filter((result) => result.ok).length
  const failed = data.results.length - passed
  const totalTime = data.results.reduce(
    (total, result) => total + (result.response?.timeMs ?? 0),
    0,
  )
  return [
    ...data.results.flatMap((result) => formatRunResult(result).split("\n")),
    "",
    `Summary: ${color(`${passed} passed`, "green")}, ${failed ? color(`${failed} failed`, "red") : "0 failed"}, ${totalTime}ms`,
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
