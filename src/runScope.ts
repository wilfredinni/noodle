import type { CaptureEntry, Environment, JsonValue } from "./schema"
import type { ResponseResolver } from "./response"
import type { RedactionSecret } from "./secrets/redact"

export type CaptureValueType =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object"

export type CaptureResult =
  | {
      variable: string
      expression: string
      success: true
      type: CaptureValueType
      value: JsonValue
      persisted?: "secret" | "environment"
    }
  | {
      variable: string
      expression: string
      success: false
      failureReason: "missing" | "resolution_error" | "persistence_error"
      message: string
    }

export class RunScope {
  private readonly values = new Map<string, JsonValue>()
  private readonly secretVariables = new Set<string>()

  set(variable: string, value: JsonValue, secret = false): void {
    this.values.set(variable, value)
    if (secret) this.secretVariables.add(variable)
    else this.secretVariables.delete(variable)
  }

  get(variable: string): JsonValue | undefined {
    return this.values.get(variable)
  }

  secretValues(): RedactionSecret[] {
    const values = [...this.secretVariables].flatMap((variable) => {
      const value = this.values.get(variable)
      return value === undefined ? [] : secretRedactionValues(value)
    })
    return [
      ...new Map(
        values.map((value) => [
          typeof value === "string"
            ? `text:${value}`
            : `${value.kind}:${value.value}`,
          value,
        ]),
      ).values(),
    ].sort((a, b) => {
      const aValue = typeof a === "string" ? a : a.value
      const bValue = typeof b === "string" ? b : b.value
      return bValue.length - aValue.length
    })
  }

  environment(base?: Environment): Environment {
    const vars = { ...(base?.vars ?? {}) }
    for (const [variable, value] of this.values) {
      Object.defineProperty(vars, variable, {
        value: typeof value === "string" ? value : JSON.stringify(value),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return { ...(base ?? {}), name: base?.name ?? "run", vars }
  }
}

function secretRedactionValues(value: JsonValue): RedactionSecret[] {
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  if (typeof value === "string") return [value]
  if (value === null || typeof value !== "object") {
    return [{ kind: "json-primitive", value: serialized }]
  }
  return [
    serialized,
    ...(Array.isArray(value) ? value : Object.values(value)).flatMap(
      secretRedactionValues,
    ),
  ]
}

export function evaluateCaptures(
  captures: Record<string, CaptureEntry>,
  resolve: ResponseResolver,
): CaptureResult[] {
  const activeCaptures = Object.entries(captures).filter(
    ([, capture]) => capture.enabled,
  )
  return activeCaptures.map(([variable, capture]) => {
    const expression = capture.value
    const resolution = resolve(expression)
    if (resolution.kind === "missing") {
      return {
        variable,
        expression,
        success: false,
        failureReason: "missing",
        message: `Expression "${expression}" is missing`,
      }
    }
    if (resolution.kind === "error") {
      return {
        variable,
        expression,
        success: false,
        failureReason: "resolution_error",
        message: resolution.message,
      }
    }

    const value = resolution.value
    return {
      variable,
      expression,
      success: true,
      type: valueType(value),
      value,
    }
  })
}

function valueType(value: JsonValue): CaptureValueType {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value as Exclude<CaptureValueType, "null" | "array">
}
