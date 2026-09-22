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
  private readonly suppressedVariables = new Set<string>()
  private readonly knownSecrets = new Map<string, RedactionSecret>()
  private readonly changed = new Set<string>()

  fork(): RunScope {
    const fork = new RunScope()
    for (const [name, value] of this.values)
      fork.values.set(name, structuredClone(value))
    for (const name of this.secretVariables) fork.secretVariables.add(name)
    for (const name of this.suppressedVariables)
      fork.suppressedVariables.add(name)
    fork.rememberSecrets(this.secretValues())
    return fork
  }

  merge(fork: RunScope, secret?: (value: JsonValue) => boolean): void {
    for (const name of fork.changed) {
      if (fork.suppressedVariables.has(name)) this.suppress(name)
      else if (fork.values.has(name))
        this.set(
          name,
          structuredClone(fork.values.get(name)!),
          fork.isSecret(name) || !!secret?.(fork.values.get(name)!),
        )
      else this.unset(name)
    }
    this.rememberSecrets(fork.secretValues())
  }

  set(variable: string, value: JsonValue, secret = false): void {
    this.changed.add(variable)
    this.values.set(variable, value)
    this.suppressedVariables.delete(variable)
    if (secret) this.secretVariables.add(variable)
    else this.secretVariables.delete(variable)
  }

  get(variable: string): JsonValue | undefined {
    return this.values.get(variable)
  }

  isSecret(variable: string): boolean {
    return this.secretVariables.has(variable)
  }

  secretValuesFor(variable: string): RedactionSecret[] {
    const value = this.values.get(variable)
    return value === undefined || !this.secretVariables.has(variable)
      ? []
      : secretRedactionValues(value)
  }

  unset(variable: string): void {
    this.changed.add(variable)
    this.values.delete(variable)
    this.secretVariables.delete(variable)
    this.suppressedVariables.delete(variable)
  }

  suppress(variable: string): void {
    this.unset(variable)
    this.suppressedVariables.add(variable)
  }

  rememberSecrets(values: readonly RedactionSecret[]): void {
    for (const value of values) {
      const key =
        typeof value === "string"
          ? `text:${value}`
          : `${value.kind}:${value.value}`
      this.knownSecrets.set(key, value)
    }
  }

  secretValues(): RedactionSecret[] {
    const values = [
      ...this.knownSecrets.values(),
      ...[...this.secretVariables].flatMap((variable) => {
        const value = this.values.get(variable)
        return value === undefined ? [] : secretRedactionValues(value)
      }),
    ]
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
    for (const variable of this.suppressedVariables) delete vars[variable]
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

export function secretRedactionValues(value: JsonValue): RedactionSecret[] {
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  if (typeof value === "string") return [value]
  if (value === null || typeof value !== "object") {
    return [{ kind: "json-primitive", value: serialized }]
  }
  return [
    serialized,
    ...(Array.isArray(value)
      ? value.flatMap(secretRedactionValues)
      : Object.entries(value).flatMap(([key, item]) => [
          key,
          ...secretRedactionValues(item),
        ])),
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
