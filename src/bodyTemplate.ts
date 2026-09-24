import type { JsonValue } from "./schema"
import { scanVariableReferences, type VariableToken } from "./variableReference"
import { JSON_VALUE_LIMITS, validateJsonValue } from "./scriptJson"
import {
  createRandomHandlers,
  RANDOM_GENERATORS,
  validateRandomArguments,
} from "./scriptRandom"

export interface RandomBodyToken {
  kind: "random"
  name: string
  start: number
  nameEnd: number
  end: number
  insideString: boolean
  arguments?: string
  error?: string
}

export type BodyTemplateToken =
  | (VariableToken & { insideString: boolean })
  | RandomBodyToken

// Return a logical character and its source width inside a JSON string.
function argumentCharacter(source: string, index: number, jsonString: boolean) {
  const char = source[index]!
  if (!jsonString) return { char, width: 1 }
  if (char === '"' || char.charCodeAt(0) < 32) throw new Error()
  if (char !== "\\") return { char, width: 1 }
  const width = source[index + 1] === "u" ? 6 : 2
  return {
    char: JSON.parse(`"${source.slice(index, index + width)}"`) as string,
    width,
  }
}

function readArguments(source: string, token: RandomBodyToken): void {
  const closing = [")"]
  let quoted = false
  let escaped = false
  let args = ""
  let index = token.nameEnd + 1
  while (index < source.length) {
    if (index - token.nameEnd > JSON_VALUE_LIMITS.bytes * 6) {
      token.error = "arguments exceed the size limit"
      break
    }
    let character: { char: string; width: number }
    try {
      character = argumentCharacter(source, index, token.insideString)
    } catch {
      token.error = "invalid JSON string escaping in arguments"
      break
    }
    const { char, width } = character
    index += width
    if (escaped) escaped = false
    else if (quoted && char === "\\") escaped = true
    else if (char === '"') quoted = !quoted
    else if (!quoted) {
      if (char === "(") closing.push(")")
      else if (char === "[") closing.push("]")
      else if (char === "{") closing.push("}")
      else if (char === ")" || char === "]" || char === "}") {
        if (char !== closing.pop()) {
          token.error = "unbalanced arguments"
          break
        }
        if (!closing.length) {
          token.arguments = args
          token.end = index
          return
        }
      }
    }
    args += char
  }
  token.end = index
  token.error ??= "unterminated arguments"
}

export function scanBodyTemplate(
  source: string,
  json = false,
): BodyTemplateToken[] {
  const tokens: BodyTemplateToken[] = []
  let cursor = 0
  let insideString = false
  let escaped = false
  for (const reference of scanVariableReferences(source)) {
    if (reference.start < cursor) continue
    for (; cursor < reference.start; cursor++) {
      const char = source[cursor]
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') insideString = !insideString
    }
    if (
      reference.kind === "reference" &&
      reference.name === "random" &&
      source[reference.end] === "."
    ) {
      let nameEnd = reference.end + 1
      while (nameEnd < source.length && /[\w.]/.test(source[nameEnd]!))
        nameEnd++
      const token: RandomBodyToken = {
        kind: "random",
        name: source.slice(reference.end + 1, nameEnd),
        start: reference.start,
        nameEnd,
        end: nameEnd,
        insideString: json && insideString,
      }
      if (source[nameEnd] === "(") readArguments(source, token)
      tokens.push(token)
      cursor = token.end
    } else {
      tokens.push({ ...reference, insideString: json && insideString })
      cursor = reference.end
    }
    escaped = false
  }
  return tokens
}

export function bodyTemplateError(
  source: string,
  token: RandomBodyToken,
  message: string,
): Error {
  const before = source.slice(0, token.start)
  const line = before.split("\n").length
  const column = before.length - before.lastIndexOf("\n")
  return new Error(
    `random.${token.name}: ${message} at line ${line}, column ${column}`,
  )
}

export function validateBodyRandom(
  source: string,
  token: RandomBodyToken,
  refDate = "2000-01-01T00:00:00.000Z",
) {
  const fail = (message: string): never => {
    throw bodyTemplateError(source, token, message)
  }
  if (token.error) fail(token.error)
  const definition = RANDOM_GENERATORS.find((item) => item.name === token.name)
  if (!definition || definition.parameters === "seed")
    return fail("unknown body generator")
  const argumentSource = token.arguments ?? ""
  if (Buffer.byteLength(argumentSource) > JSON_VALUE_LIMITS.bytes)
    fail("arguments exceed the size limit")
  let parsed: unknown
  try {
    parsed = JSON.parse(`[${argumentSource}]`)
  } catch {
    return fail("arguments must be JSON literals")
  }
  const args = validateJsonValue(parsed, (message) =>
    bodyTemplateError(source, token, message),
  ) as JsonValue[]
  validateRandomArguments(definition.parameters, args, refDate, fail)
  return { definition, args }
}

export type BodyRandomResolver = (
  source: string,
  token: RandomBodyToken,
) => JsonValue

export function createBodyRandomResolver(
  rememberPassword: (value: string) => void,
): BodyRandomResolver {
  const refDate = new Date().toISOString()
  const handlers = createRandomHandlers(
    (message) => new Error(message),
    rememberPassword,
    refDate,
  )
  return (source, token) => {
    const { args } = validateBodyRandom(source, token, refDate)
    try {
      return validateJsonValue(
        handlers[`random.${token.name}`]!(args),
        (message) => new Error(message),
      )
    } catch {
      throw bodyTemplateError(
        source,
        token,
        "cannot generate a value with these options",
      )
    }
  }
}

export const previewBodyRandom: BodyRandomResolver = (source, token) => {
  const { definition, args } = validateBodyRandom(source, token)
  if (definition.parameters === "pick") return (args[0] as JsonValue[])[0]!
  return definition.returns === "number"
    ? 0
    : definition.returns === "boolean"
      ? false
      : "example"
}

export function renderRandomValue(
  value: JsonValue,
  json: boolean,
  insideString: boolean,
): string {
  if (json && !insideString) return JSON.stringify(value)
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return json ? JSON.stringify(text).slice(1, -1) : text
}

export function substituteBodyTemplate(
  source: string,
  json: boolean,
  resolveVariable: (name: string) => string,
  resolveRandom?: BodyRandomResolver,
): string {
  let result = ""
  let cursor = 0
  let generated = false
  for (const token of scanBodyTemplate(source, json)) {
    result += source.slice(cursor, token.start)
    if (token.kind === "random") {
      if (resolveRandom) {
        result += renderRandomValue(
          resolveRandom(source, token),
          json,
          token.insideString,
        )
        generated = true
      } else result += source.slice(token.start, token.end)
    } else result += token.kind === "escape" ? "$" : resolveVariable(token.name)
    cursor = token.end
  }
  result += source.slice(cursor)
  if (generated && json) {
    try {
      JSON.parse(result)
    } catch {
      throw new Error("Invalid JSON after body template substitution")
    }
  }
  return result
}
