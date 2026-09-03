const VARIABLE_REFERENCE_RE = /^\$(\w+)$/
const VARIABLE_NAME_RE = /^\w+$/

export interface VariableReference {
  kind: "reference"
  name: string
  start: number
  end: number
}

export interface VariableEscape {
  kind: "escape"
  start: number
  end: number
}

export type VariableToken = VariableReference | VariableEscape

export function isValidVariableName(value: string): boolean {
  return VARIABLE_NAME_RE.test(value)
}

export function scanVariableReferences(value: string): VariableToken[] {
  const tokens: VariableToken[] = []
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== "$") continue
    if (value[index + 1] === "$") {
      tokens.push({ kind: "escape", start: index, end: index + 2 })
      index++
      continue
    }
    let end = index + 1
    while (end < value.length && /\w/.test(value[end]!)) end++
    if (end > index + 1) {
      tokens.push({
        kind: "reference",
        name: value.slice(index + 1, end),
        start: index,
        end,
      })
      index = end - 1
    }
  }
  return tokens
}

export function variableReferences(value: string): VariableReference[] {
  return scanVariableReferences(value).filter(
    (token): token is VariableReference => token.kind === "reference",
  )
}

export function replaceVariableReferences(
  value: string,
  resolve: (name: string, reference: VariableReference) => string,
  replaceEscape: (escape: VariableEscape) => string = () => "$",
): string {
  let result = ""
  let cursor = 0
  for (const token of scanVariableReferences(value)) {
    result += value.slice(cursor, token.start)
    result +=
      token.kind === "escape"
        ? replaceEscape(token)
        : resolve(token.name, token)
    cursor = token.end
  }
  return result + value.slice(cursor)
}

export function variableReferenceName(value: string): string | undefined {
  return value.match(VARIABLE_REFERENCE_RE)?.[1]
}

export function isVariableReference(value: string): boolean {
  return variableReferenceName(value) !== undefined
}
