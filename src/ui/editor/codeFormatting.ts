import { format, parseTree, type Edit, type ParseError } from "jsonc-parser"
import { scanBodyTemplate } from "../../bodyTemplate"
import { isExternalScriptSource } from "../../lang/scriptSource"
import type { BodyType, ScriptFields } from "../../schema"
import { SCRIPT_TABS, scriptText, withScript } from "../../scriptAuthoring"
import type { createScriptDiagnostics } from "./scriptDiagnostics"

export type CodeEdit = Edit
export type PreparedSave<T> = { fields: T; apply?: () => void }
export type PrepareScriptFields = (
  fields: ScriptFields,
) => Promise<PreparedSave<ScriptFields>>

export function formatJsonCode(source: string): CodeEdit[] | null {
  if (!source.trim()) return []
  let masked = source
  for (const token of scanBodyTemplate(source, true).reverse()) {
    if ("error" in token && token.error) return null
    if (token.insideString || token.kind === "escape") continue
    // Equal-length number tokens preserve source offsets without evaluating templates.
    masked =
      masked.slice(0, token.start) +
      "1".repeat(token.end - token.start) +
      masked.slice(token.end)
  }
  const errors: ParseError[] = []
  parseTree(masked, errors, {
    disallowComments: true,
    allowTrailingComma: false,
  })
  if (errors.length) return null
  return format(masked, undefined, {
    tabSize: 2,
    insertSpaces: true,
    eol: "\n",
  })
}

export function applyCodeEdits(source: string, edits: CodeEdit[]): string {
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset))
    source =
      source.slice(0, edit.offset) +
      edit.content +
      source.slice(edit.offset + edit.length)
  return source
}

export function formattedOffset(offset: number, edits: CodeEdit[]): number {
  let delta = 0
  for (const edit of [...edits].sort((a, b) => a.offset - b.offset)) {
    if (offset < edit.offset) break
    if (offset <= edit.offset + edit.length)
      return edit.offset + delta + edit.content.length
    delta += edit.content.length - edit.length
  }
  return offset + delta
}

export async function formatCodeFields<
  T extends ScriptFields & { body?: string; bodyType?: BodyType },
>(
  fields: T,
  service: Pick<ReturnType<typeof createScriptDiagnostics>, "format">,
): Promise<{
  fields: T
  edits: Partial<Record<"body" | "pre" | "post" | "tests", CodeEdit[]>>
  failed: boolean
}> {
  let next = fields
  let failed = false
  const edits: Partial<Record<"body" | "pre" | "post" | "tests", CodeEdit[]>> =
    {}
  if (fields.body !== undefined && (fields.bodyType ?? "json") === "json") {
    const changes = formatJsonCode(fields.body)
    if (changes?.length) {
      edits.body = changes
      next = { ...next, body: applyCodeEdits(fields.body, changes) }
    }
  }
  for (const { phase } of SCRIPT_TABS) {
    const source = scriptText(fields, phase)
    if (!source.trim() || isExternalScriptSource(source)) continue
    let changes: CodeEdit[] | null
    try {
      changes = await service.format(source, phase)
    } catch {
      failed = true
      continue
    }
    if (changes?.length) {
      edits[phase] = changes
      next = withScript(next, phase, applyCodeEdits(source, changes))
    }
  }
  return { fields: next, edits, failed }
}
