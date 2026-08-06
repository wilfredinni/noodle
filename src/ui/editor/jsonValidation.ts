import { parse, ParseErrorCode, type ParseError } from "jsonc-parser"
import type { Environment } from "../../schema"

const VAR_RE = /\$(\w+)/g

interface Replacement {
  name: string
  value: string
  insideString: boolean
  sourceStart: number
  sourceEnd: number
  outputStart: number
  outputEnd: number
}

function isInsideString(content: string, offset: number): boolean {
  let inside = false
  let escaped = false
  for (let i = 0; i < offset; i++) {
    const char = content[i]
    if (escaped) escaped = false
    else if (char === "\\") escaped = true
    else if (char === '"') inside = !inside
  }
  return inside
}

const ERROR_MESSAGES: Record<ParseErrorCode, string> = {
  [ParseErrorCode.InvalidSymbol]: "Invalid symbol",
  [ParseErrorCode.InvalidNumberFormat]: "Invalid number",
  [ParseErrorCode.PropertyNameExpected]: "Expected a property name",
  [ParseErrorCode.ValueExpected]: "Expected a value",
  [ParseErrorCode.ColonExpected]: "Expected ':'",
  [ParseErrorCode.CommaExpected]: "Expected ','",
  [ParseErrorCode.CloseBraceExpected]: "Expected '}'",
  [ParseErrorCode.CloseBracketExpected]: "Expected ']'",
  [ParseErrorCode.EndOfFileExpected]: "Unexpected content after JSON value",
  [ParseErrorCode.InvalidCommentToken]: "Comments are not allowed",
  [ParseErrorCode.UnexpectedEndOfComment]: "Unterminated comment",
  [ParseErrorCode.UnexpectedEndOfString]: "Unterminated string",
  [ParseErrorCode.UnexpectedEndOfNumber]: "Incomplete number",
  [ParseErrorCode.InvalidUnicode]: "Invalid Unicode escape",
  [ParseErrorCode.InvalidEscapeCharacter]: "Invalid escape character",
  [ParseErrorCode.InvalidCharacter]: "Invalid character",
}

function sourcePosition(content: string, offset: number): string {
  const before = content.slice(0, Math.max(0, Math.min(offset, content.length)))
  const line = before.split("\n").length
  const column = before.length - before.lastIndexOf("\n")
  return `line ${line}, column ${column}`
}

function substituteVariables(
  content: string,
  env: Environment,
): { content: string; replacements: Replacement[] } | { error: string } {
  let substituted = ""
  let sourceCursor = 0
  const replacements: Replacement[] = []

  for (const match of content.matchAll(VAR_RE)) {
    const sourceStart = match.index
    const token = match[0]
    const name = match[1]!
    if (!Object.hasOwn(env.vars, name)) {
      return {
        error: `Invalid JSON: unresolved variable "${name}" at ${sourcePosition(content, sourceStart)}`,
      }
    }

    substituted += content.slice(sourceCursor, sourceStart)
    const outputStart = substituted.length
    const value = env.vars[name]!
    substituted += value
    replacements.push({
      name,
      value,
      insideString: isInsideString(content, sourceStart),
      sourceStart,
      sourceEnd: sourceStart + token.length,
      outputStart,
      outputEnd: substituted.length,
    })
    sourceCursor = sourceStart + token.length
  }

  substituted += content.slice(sourceCursor)
  return { content: substituted, replacements }
}

function collectParseErrors(content: string): ParseError[] {
  const errors: ParseError[] = []
  parse(content, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  })
  return errors
}

function mapErrorOffset(
  offset: number,
  code: ParseErrorCode,
  replacements: Replacement[],
): { offset: number; variable?: string } {
  let adjustment = 0
  for (const replacement of replacements) {
    if (offset < replacement.outputStart) break

    const endsInReplacement =
      offset < replacement.outputEnd ||
      (offset === replacement.outputEnd &&
        (replacement.outputStart === replacement.outputEnd ||
          code === ParseErrorCode.CloseBraceExpected ||
          code === ParseErrorCode.CloseBracketExpected))
    if (endsInReplacement) {
      return { offset: replacement.sourceStart, variable: replacement.name }
    }

    adjustment +=
      replacement.sourceEnd -
      replacement.sourceStart -
      (replacement.outputEnd - replacement.outputStart)
  }
  return { offset: offset + adjustment }
}

function formatParseError(
  content: string,
  error: ParseError,
  replacements: Replacement[],
): string {
  const mapped = mapErrorOffset(error.offset, error.error, replacements)
  const variable = mapped.variable ? ` in value of $${mapped.variable}` : ""
  return `${ERROR_MESSAGES[error.error]}${variable} at ${sourcePosition(content, mapped.offset)}`
}

/**
 * Validates the JSON that will actually be sent after Noodle's textual
 * environment-variable substitution. Values are deliberately not coerced or
 * quoted here; this mirrors requests/substitute.ts exactly.
 */
export function validateJsonContent(
  content: string,
  env: Environment | null,
): string | null {
  if (content.trim() === "") return null

  const substitution =
    env === null
      ? { content, replacements: [] }
      : substituteVariables(content, env)
  if ("error" in substitution) return substitution.error

  try {
    JSON.parse(substitution.content)
    return null
  } catch (nativeError) {
    const errors = collectParseErrors(substitution.content)
    const error = errors[0]
    const mapped = error
      ? mapErrorOffset(error.offset, error.error, substitution.replacements)
      : null
    const replacementError = substitution.replacements
      .filter(
        (replacement) =>
          !replacement.insideString &&
          replacement.sourceStart <= (mapped?.offset ?? content.length),
      )
      .map((replacement) => ({
        replacement,
        error: collectParseErrors(replacement.value)[0],
      }))
      .find((candidate) => candidate.error)
    if (replacementError?.error) {
      const { replacement, error: variableError } = replacementError
      return `Invalid JSON: ${ERROR_MESSAGES[variableError.error]} in value of $${replacement.name} at ${sourcePosition(content, replacement.sourceStart)}`
    }
    if (error) {
      return `Invalid JSON: ${formatParseError(content, error, substitution.replacements)}`
    }

    const message =
      nativeError instanceof Error ? nativeError.message : String(nativeError)
    return `Invalid JSON: ${message}`
  }
}
