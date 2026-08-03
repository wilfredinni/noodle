type JsonReviver = (this: unknown, key: string, value: unknown) => unknown

type JsonWithRawValues = typeof JSON & {
  rawJSON(value: string): unknown
}

const json = JSON as JsonWithRawValues

export interface RawJsonNumber {
  rawJSON: string
}

const preserveNumberSource = (
  _key: string,
  value: unknown,
  context: { source: string },
): unknown => (typeof value === "number" ? json.rawJSON(context.source) : value)

export function parseJsonPreservingNumbers(value: string): unknown {
  return JSON.parse(value, preserveNumberSource as JsonReviver)
}

export function isRawJsonNumber(value: unknown): value is RawJsonNumber {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === null &&
    Object.keys(value).length === 1 &&
    typeof (value as RawJsonNumber).rawJSON === "string"
  )
}

export function formatJson(value: string): string {
  try {
    return JSON.stringify(parseJsonPreservingNumbers(value), null, 2)
  } catch {
    return value
  }
}
