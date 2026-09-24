import type { Environment } from "../../schema"
import type { Highlight } from "@opentui/core"
import { variableReferences } from "../../variableReference"
import { scanBodyTemplate, previewBodyValue } from "../../bodyTemplate"
import { RANDOM_GENERATORS } from "../../scriptRandom"
import { TIME_METHODS } from "../../scriptTime"

export type BodyCompletion = "json" | "text"

const bodyGenerators = RANDOM_GENERATORS.filter(
  (item) => item.parameters !== "seed",
)

export function bodyVariableNames(
  names: Iterable<string>,
  prefix: string,
): string[] {
  if (prefix.startsWith("random."))
    return bodyGenerators.map((item) => `random.${item.name}`)
  if (prefix.startsWith("time."))
    return TIME_METHODS.map((item) => `time.${item.name}`)
  return [...names, "random.", "time."]
}

export function variableCompletionItem(name: string, body?: BodyCompletion) {
  const time = body && TIME_METHODS.find((item) => `time.${item.name}` === name)
  if (time)
    return {
      key: name,
      label: `$${name}`,
      description: time.description,
      signature: `$time.${time.signature}`,
      example: `$time.${time.example}`,
    }
  const definition =
    body && name.startsWith("random.")
      ? bodyGenerators.find((item) => `random.${item.name}` === name)
      : undefined
  const examples = {
    none: "",
    range: '{"min":18,"max":80}',
    float: '{"min":0,"max":1,"fractionDigits":2}',
    price: '{"min":1,"max":100,"fractionDigits":2}',
    length: '{"length":12}',
    count: '{"count":3}',
    years: '{"years":1}',
    days: '{"days":7}',
    image: '{"width":640,"height":480}',
    pick: '["admin","user"]',
    seed: "42",
  }
  return {
    key: name,
    label: `$${name}`,
    ...(definition
      ? {
          description: definition.description,
          signature: `$random.${definition.signature}`,
          example: `$${name}${definition.parameters === "none" ? "" : `(${examples[definition.parameters]})`}`,
        }
      : {}),
  }
}

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
  body?: BodyCompletion,
): VariableToken | null {
  const cursor = Math.max(0, Math.min(cursorOffset, value.length))
  if (body) {
    for (const token of scanBodyTemplate(value, body === "json")) {
      if (
        (token.kind !== "random" && token.kind !== "time") ||
        cursor < token.start ||
        cursor > token.end
      )
        continue
      if (cursor > token.nameEnd) return null
      return {
        start: token.start,
        end: token.nameEnd,
        prefix: value.slice(token.start + 1, cursor),
      }
    }
  }
  let start = cursor
  while (start > 0 && /\w/.test(value[start - 1]!)) start--
  if (start === 0 || value[start - 1] !== "$") return null

  const dollar = start - 1
  let dollarRunStart = dollar
  while (dollarRunStart > 0 && value[dollarRunStart - 1] === "$") {
    dollarRunStart--
  }
  if ((dollar - dollarRunStart + 1) % 2 === 0) return null
  start = dollar
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
    .filter((name) => name.toLowerCase().includes(normalizedPrefix))
    .sort((a, b) => a.localeCompare(b))
}

export function replaceVariableToken(
  value: string,
  token: VariableToken,
  name: string,
  body?: BodyCompletion,
): { value: string; cursorOffset: number } {
  if (body && name === "random.pick" && value[token.end] !== "(") {
    const replacement = "$random.pick([])"
    return {
      value: value.slice(0, token.start) + replacement + value.slice(token.end),
      cursorOffset: token.start + replacement.length - 2,
    }
  }
  if (
    body &&
    value[token.end] !== "(" &&
    TIME_METHODS.some((item) => `time.${item.name}` === name && item.min > 0)
  ) {
    const replacement = `$${name}()`
    return {
      value: value.slice(0, token.start) + replacement + value.slice(token.end),
      cursorOffset: token.start + replacement.length - 1,
    }
  }
  const replacement = `$${name}`
  return {
    value: value.slice(0, token.start) + replacement + value.slice(token.end),
    cursorOffset: token.start + replacement.length,
  }
}

export function getVariableHighlights(
  value: string,
  env: Environment | null,
  body?: BodyCompletion,
): VariableHighlight[] {
  const highlights: VariableHighlight[] = []
  for (const reference of body
    ? scanBodyTemplate(value, body === "json")
    : variableReferences(value)) {
    if (reference.kind === "escape") continue
    let exists = env !== null && Object.hasOwn(env.vars, reference.name)
    if (reference.kind === "random" || reference.kind === "time") {
      try {
        previewBodyValue(value, reference)
        exists = true
      } catch {
        exists = false
      }
    }
    highlights.push({
      start: reference.start,
      end: reference.end,
      exists,
    })
  }
  return highlights
}

export function getEnvVarHighlights(
  value: string,
  env: Environment | null,
  resolvedStyleId: number,
  missingStyleId: number,
  body?: BodyCompletion,
): Highlight[] {
  const highlights: Highlight[] = []
  for (const reference of getVariableHighlights(value, env, body)) {
    highlights.push({
      start: reference.start,
      end: reference.end,
      styleId: reference.exists ? resolvedStyleId : missingStyleId,
      priority: 2,
    })
  }
  return highlights
}
