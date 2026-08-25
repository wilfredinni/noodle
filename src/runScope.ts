import type { Environment, JsonValue } from "./schema"
import type { ResponseResolver } from "./response"

export type CaptureValueType =
  "null" | "boolean" | "number" | "string" | "array" | "object"

export type CaptureResult =
  | {
      variable: string
      expression: string
      success: true
      type: CaptureValueType
      value: JsonValue
    }
  | {
      variable: string
      expression: string
      success: false
      failureReason: "missing" | "resolution_error"
      message: string
    }

export class RunScope {
  private readonly values = new Map<string, JsonValue>()

  set(variable: string, value: JsonValue): void {
    this.values.set(variable, value)
  }

  get(variable: string): JsonValue | undefined {
    return this.values.get(variable)
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

export function evaluateCaptures(
  captures: Record<string, string>,
  resolve: ResponseResolver,
): CaptureResult[] {
  return Object.entries(captures).map(([variable, expression]) => {
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
