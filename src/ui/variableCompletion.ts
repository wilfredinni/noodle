import type { Environment } from "../schema"
import type { Highlight } from "@opentui/core"

export interface VariableToken {
  start: number
  end: number
  prefix: string
}

export interface VariableHighlight {
  start: number
  end: number
  exists: boolean
}

export function getVariableToken(
  value: string,
  cursorOffset: number,
): VariableToken | null {
  const cursor = Math.max(0, Math.min(cursorOffset, value.length))
  let start = cursor
  while (start > 0 && /\w/.test(value[start - 1]!)) start--
  if (start === 0 || value[start - 1] !== "$") return null

  start--
  let end = cursor
  while (end < value.length && /\w/.test(value[end]!)) end++

  return { start, end, prefix: value.slice(start + 1, cursor) }
}

export function getVariableSuggestions(
  names: Iterable<string>,
  prefix: string,
): string[] {
  const normalizedPrefix = prefix.toLowerCase()
  return [...new Set(names)]
    .filter((name) => name.toLowerCase().startsWith(normalizedPrefix))
    .sort((a, b) => a.localeCompare(b))
}

export function replaceVariableToken(
  value: string,
  token: VariableToken,
  name: string,
): { value: string; cursorOffset: number } {
  const replacement = `$${name}`
  return {
    value: value.slice(0, token.start) + replacement + value.slice(token.end),
    cursorOffset: token.start + replacement.length,
  }
}

export function getVariableHighlights(
  value: string,
  env: Environment | null,
): VariableHighlight[] {
  const highlights: VariableHighlight[] = []
  for (const match of value.matchAll(/\$(\w+)/g)) {
    highlights.push({
      start: match.index,
      end: match.index + match[0].length,
      exists: env !== null && match[1]! in env.vars,
    })
  }
  return highlights
}

export function getEnvVarHighlights(
  value: string,
  env: Environment,
  resolvedStyleId: number,
  missingStyleId: number,
): Highlight[] {
  const highlights: Highlight[] = []
  for (const match of value.matchAll(/\$(\w+)/g)) {
    const name = match[1]!
    highlights.push({
      start: match.index,
      end: match.index + match[0].length,
      styleId: name in env.vars ? resolvedStyleId : missingStyleId,
      priority: 2,
    })
  }
  return highlights
}
