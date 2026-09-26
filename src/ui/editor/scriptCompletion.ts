import { SCRIPT_API_CONTRACT, type ScriptPhase } from "../../preRequestScript"
import { javascriptTokens } from "./javascriptSyntax"

export function scriptCompletions(
  source: string,
  cursor: number,
  phase: ScriptPhase,
) {
  if (
    javascriptTokens(source).some(
      (token) =>
        (token.kind === "string" || token.kind === "comment") &&
        cursor > token.start &&
        (cursor < token.end ||
          (cursor === token.end &&
            (token.kind === "comment"
              ? !source.slice(token.start, token.end).endsWith("*/")
              : source[token.end - 1] !== source[token.start]))),
    )
  )
    return null
  const before = source.slice(0, cursor)
  // Matcher methods belong to the value returned by expect(), never expect itself.
  const matcher = /\bexpect\([^\n]*\)\.(not\.)?([\w$]*)$/.exec(before)
  const chain = /[\w$]+(?:\.[\w$]*)*$/.exec(before)
  if (!matcher && !chain) return null
  const text = matcher ? matcher[2]! : chain![0]
  const dot = text.lastIndexOf(".")
  const parent = matcher ? "expect" : dot < 0 ? "" : text.slice(0, dot)
  const query = matcher ? text : text.slice(dot + 1)
  const start = cursor - query.length
  const end = cursor + (/^[\w$]*/.exec(source.slice(cursor))?.[0].length ?? 0)
  if (
    query &&
    SCRIPT_API_CONTRACT.some(
      (entry) =>
        entry.phases.includes(phase) &&
        (matcher
          ? entry.global === "expect" && entry.member === query
          : (entry.member
              ? `${entry.global}.${entry.member}`
              : entry.global) === chain?.[0]),
    )
  )
    return { start, end, query, items: [] }
  const items = SCRIPT_API_CONTRACT.filter((entry) =>
    entry.phases.includes(phase),
  ).flatMap((entry) => {
    const full = entry.member ? `${entry.global}.${entry.member}` : entry.global
    let label: string
    let insert: string
    if (matcher) {
      if (
        entry.global !== "expect" ||
        !entry.member ||
        (matcher[1] && entry.member === "not")
      )
        return []
      label = insert = entry.member
    } else if (!parent) {
      if (entry.global === "expect" && entry.member) return []
      if (
        entry.member.includes(".") ||
        (entry.global === "console" && entry.member)
      )
        return []
      label = insert = full
    } else {
      if (entry.global === "expect") return []
      if (!full.startsWith(`${parent}.`)) return []
      label = insert = full.slice(parent.length + 1)
      if (label.includes(".")) return []
    }
    if (!label.toLowerCase().includes(query.toLowerCase()) || label === query)
      return []
    return [
      {
        key: full,
        label,
        insert,
        matchQuery: query,
        description: `${entry.signature} · ${entry.description}`,
      },
    ]
  })
  return { start, end, query, items }
}
