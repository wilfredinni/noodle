export interface YamlValidationNotice {
  title: string
  detail: string
}

export type YamlFileKind = "request" | "folder"

interface FormatYamlValidationNoticeOptions {
  kind: YamlFileKind
  fileName: string
  source: string
  error: unknown
}

interface ErrorLocation {
  line: number
  column?: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function removeEditorPrefixes(message: string, kind: YamlFileKind): string {
  const parserPrefix =
    kind === "folder" ? "lang.parseFolder" : "lang.parseRequest"
  const titlePrefix =
    kind === "folder" ? "Invalid folder YAML" : "Invalid request YAML"

  return message
    .replace(
      new RegExp(`^${escapeRegExp(titlePrefix)}(?::| for [^:]+:)?\\s*`),
      "",
    )
    .replace(new RegExp(`^${escapeRegExp(parserPrefix)}:\\s*`), "")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractLocation(message: string): {
  detail: string
  location?: ErrorLocation
} {
  const locationMatch = message.match(/\((\d+)(?::(\d+))?\)/)
  const withoutLocation = locationMatch
    ? `${message.slice(0, locationMatch.index)}${message.slice(
        (locationMatch.index ?? 0) + locationMatch[0].length,
      )}`
    : message
  const detail = withoutLocation.split(/\r?\n/, 1)[0]?.trim() ?? ""

  if (!locationMatch) return { detail }
  return {
    detail,
    location: {
      line: Number(locationMatch[1]),
      ...(locationMatch[2] !== undefined
        ? { column: Number(locationMatch[2]) }
        : {}),
    },
  }
}

function extractFieldName(detail: string): string | undefined {
  const namedField = detail.match(/\b(?:field|key)\s+["']([^"']+)["']/i)?.[1]
  if (namedField) return namedField

  const quotedField = detail.match(/^["']([^"']+)["']\s+must\b/i)?.[1]
  if (quotedField) return quotedField

  return detail.match(
    /^([A-Za-z_][\w.-]*(?:\[\d+\])?(?:\.[A-Za-z_][\w-]*)*)\s+must\b/i,
  )?.[1]
}

function yamlKey(line: string): string | undefined {
  const match = line.match(
    /^\s*(?:-\s+)?(?:"((?:\\.|[^"])*)"|'((?:''|[^'])*)'|([^:#][^:]*?))\s*:/,
  )
  if (!match) return undefined
  if (match[1] !== undefined) return match[1].replace(/\\(["\\])/g, "$1")
  if (match[2] !== undefined) return match[2].replace(/''/g, "'")
  return match[3]?.trim()
}

function inferLocation(
  detail: string,
  source: string,
): ErrorLocation | undefined {
  const fieldName = extractFieldName(detail)
  if (!fieldName) return undefined

  const candidates = new Set([fieldName])
  const leaf = fieldName
    .split(".")
    .at(-1)
    ?.replace(/\[\d+\]$/, "")
  if (leaf) candidates.add(leaf)

  const matches: number[] = []
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const key = yamlKey(line)
    if (key && candidates.has(key)) matches.push(index + 1)
  }

  return matches.length === 1 ? { line: matches[0]! } : undefined
}

export function formatYamlValidationNotice({
  kind,
  fileName,
  source,
  error,
}: FormatYamlValidationNoticeOptions): YamlValidationNotice {
  const titleBase =
    kind === "folder" ? "Invalid folder YAML" : "Invalid request YAML"
  const message = removeEditorPrefixes(
    errorMessage(error).trim(),
    kind,
  ).replace(/^YAML syntax:\s*/, "")
  const { detail, location: parserLocation } = extractLocation(message)
  const location = parserLocation ?? inferLocation(detail, source)
  const locationPrefix = location
    ? `Line ${location.line}${location.column === undefined ? "" : `, Col ${location.column}`}: `
    : ""

  return {
    title: `${titleBase} for ${fileName}`,
    detail: `${locationPrefix}${detail}`,
  }
}
