import type { AssertionValue, Request, ResponseAssertion } from "../schema"

export type AutomationRow =
  | { kind: "tag"; index: number; value: string }
  | { kind: "add-tag" }
  | { kind: "capture"; index: number; variable: string; expression: string }
  | { kind: "add-capture" }
  | { kind: "assertion"; index: number; assertion: ResponseAssertion }
  | { kind: "add-assertion" }

export function automationRows(
  request: Pick<Request, "tags" | "captures" | "assertions"> | null,
): AutomationRow[] {
  return [
    ...(request?.tags ?? []).map((value, index): AutomationRow => ({
      kind: "tag",
      index,
      value,
    })),
    { kind: "add-tag" },
    ...Object.entries(request?.captures ?? {}).map(
      ([variable, expression], index): AutomationRow => ({
        kind: "capture",
        index,
        variable,
        expression,
      }),
    ),
    { kind: "add-capture" },
    ...(request?.assertions ?? []).map((assertion, index): AutomationRow => ({
      kind: "assertion",
      index,
      assertion,
    })),
    { kind: "add-assertion" },
  ]
}

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
