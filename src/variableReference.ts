const VARIABLE_REFERENCE_RE = /^\$(\w+)$/

export function variableReferenceName(value: string): string | undefined {
  return value.match(VARIABLE_REFERENCE_RE)?.[1]
}

export function isVariableReference(value: string): boolean {
  return variableReferenceName(value) !== undefined
}
