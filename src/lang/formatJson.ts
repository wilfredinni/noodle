type JsonReviver = (this: unknown, key: string, value: unknown) => unknown

type JsonWithRawValues = typeof JSON & {
  rawJSON(value: string): unknown
}

const json = JSON as JsonWithRawValues

const preserveNumberSource = (
  _key: string,
  value: unknown,
  context: { source: string },
): unknown => (typeof value === "number" ? json.rawJSON(context.source) : value)

export function formatJson(value: string): string {
  try {
    return JSON.stringify(
      JSON.parse(value, preserveNumberSource as JsonReviver),
      null,
      2,
    )
  } catch {
    return value
  }
}
