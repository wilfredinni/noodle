import type { JsonValue } from "./schema"

export const JSON_VALUE_LIMITS = Object.freeze({ bytes: 256 * 1024, depth: 32 })
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"])

export function validateJsonValue(
  value: unknown,
  error: (message: string) => Error,
): JsonValue {
  const seen = new Set<object>()
  const visit = (current: unknown, depth: number): JsonValue => {
    if (depth > JSON_VALUE_LIMITS.depth) {
      throw error(`JSON depth exceeds ${JSON_VALUE_LIMITS.depth}`)
    }
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    )
      return current
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw error("JSON numbers must be finite")
      return current
    }
    if (typeof current !== "object") {
      throw error("value must be JSON-compatible")
    }
    if (seen.has(current)) throw error("JSON value must not contain cycles")
    const prototype = Object.getPrototypeOf(current)
    if (
      (Array.isArray(current) && prototype !== Array.prototype) ||
      (!Array.isArray(current) &&
        prototype !== Object.prototype &&
        prototype !== null)
    ) {
      throw error("JSON objects must have a plain or null prototype")
    }
    seen.add(current)
    let result: JsonValue
    if (Array.isArray(current)) {
      const values = new Map<number, unknown>()
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === "symbol") {
          throw error("JSON values must not contain symbol keys")
        }
        if (key === "length") continue
        if (UNSAFE_KEYS.has(key)) throw error(`unsafe JSON key "${key}"`)
        const index = Number(key)
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= current.length ||
          String(index) !== key
        ) {
          throw error("JSON arrays must not contain extra properties")
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw error("JSON array members must be enumerable data values")
        }
        if (descriptor.value === undefined) {
          throw error("JSON array members must not be undefined")
        }
        values.set(index, descriptor.value)
      }
      result = []
      for (let index = 0; index < current.length; index++) {
        if (!values.has(index)) {
          throw error("JSON array members must not be undefined")
        }
        result.push(visit(values.get(index), depth + 1))
      }
    } else {
      const object: Record<string, JsonValue> = Object.create(null)
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === "symbol") {
          throw error("JSON values must not contain symbol keys")
        }
        if (UNSAFE_KEYS.has(key)) throw error(`unsafe JSON key "${key}"`)
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw error("JSON object members must be enumerable data values")
        }
        const item = descriptor.value
        if (item === undefined)
          throw error("JSON object members must not be undefined")
        Object.defineProperty(object, key, {
          value: visit(item, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      result = object
    }
    seen.delete(current)
    return result
  }
  const validated = visit(value, 0)
  if (Buffer.byteLength(JSON.stringify(validated)) > JSON_VALUE_LIMITS.bytes) {
    throw error(`bridged value exceeds ${JSON_VALUE_LIMITS.bytes} bytes`)
  }
  return validated
}
