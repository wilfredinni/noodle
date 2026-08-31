import type { AssertionValue } from "../schema"

export function formatAssertionValue(value: AssertionValue): string {
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    parseAssertionValue(value) === value
  ) {
    return value
  }
  return JSON.stringify(value)
}

export function parseAssertionValue(value: string): AssertionValue {
  try {
    return JSON.parse(value) as AssertionValue
  } catch {
    return value
  }
}
