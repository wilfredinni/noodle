import type { AssertionValue } from "../schema"

export function formatAssertionValue(value: AssertionValue): string {
  return JSON.stringify(value)
}

export function parseAssertionValue(value: string): AssertionValue {
  try {
    return JSON.parse(value) as AssertionValue
  } catch {
    return value
  }
}
