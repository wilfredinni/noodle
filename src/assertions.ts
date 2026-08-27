import { isDeepStrictEqual } from "node:util"
import type {
  AssertionOperator,
  AssertionValue,
  Response,
  ResponseAssertion,
} from "./schema"
import { createResponseResolver, type ResponseResolver } from "./response"

export interface AssertionResult {
  expression: string
  operator: AssertionOperator
  expected?: AssertionValue
  actual?: AssertionValue
  passed: boolean
  message: string
}

type CompiledAssertionRegex =
  | { kind: "success"; regex: RegExp }
  | { kind: "error"; message: string }

export function compileAssertionRegex(source: string): CompiledAssertionRegex {
  if (source.length > 1000) {
    return { kind: "error", message: "Regular expression is too long" }
  }
  let regex: RegExp
  try {
    regex = new RegExp(source)
  } catch {
    return { kind: "error", message: "Invalid regular expression" }
  }

  let canQuantify = false
  let escaped = false
  let inClass = false
  let quantifiers = 0
  for (const character of source) {
    if (escaped) {
      if (!inClass && /[1-9k]/.test(character)) {
        return {
          kind: "error",
          message: "Regular expression uses unsupported syntax",
        }
      }
      escaped = false
      canQuantify = true
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (inClass) {
      if (character === "]") {
        inClass = false
        canQuantify = true
      }
      continue
    }
    if (character === "[") {
      inClass = true
      canQuantify = false
      continue
    }
    if ("()|{}".includes(character)) {
      return {
        kind: "error",
        message: "Regular expression uses unsupported syntax",
      }
    }
    if ("*+?".includes(character)) {
      quantifiers++
      if (
        !canQuantify ||
        quantifiers > 1 ||
        ((character === "*" || character === "+") && !source.startsWith("^"))
      ) {
        return {
          kind: "error",
          message: "Regular expression uses unsupported syntax",
        }
      }
      canQuantify = false
      continue
    }
    canQuantify = character !== "^" && character !== "$"
  }
  return { kind: "success", regex }
}

export function evaluateAssertions(
  assertions: ResponseAssertion[],
  response: Response,
  resolve: ResponseResolver = createResponseResolver(response),
): AssertionResult[] {
  return assertions.map((assertion) => {
    const resolution = resolve(assertion.expression)
    const expected = Object.hasOwn(assertion, "value")
      ? { expected: assertion.value }
      : {}
    const base = {
      expression: assertion.expression,
      operator: assertion.operator,
      ...expected,
    }

    if (resolution.kind === "error") {
      return {
        ...base,
        passed: false,
        message: resolution.message,
      }
    }
    if (resolution.kind === "missing") {
      const passed = assertion.operator === "notExists"
      return {
        ...base,
        passed,
        message: passed
          ? "Assertion passed"
          : `Expression "${assertion.expression}" is missing`,
      }
    }

    const actual = resolution.value
    const result = evaluateValue(assertion, actual)
    return { ...base, actual, ...result }
  })
}

function evaluateValue(
  assertion: ResponseAssertion,
  actual: AssertionValue,
): Pick<AssertionResult, "passed" | "message"> {
  const pass = (passed: boolean, failure: string) => ({
    passed,
    message: passed ? "Assertion passed" : failure,
  })

  switch (assertion.operator) {
    case "exists":
      return pass(true, "")
    case "notExists":
      return pass(false, `Expression "${assertion.expression}" exists`)
    case "isString":
      return pass(typeof actual === "string", "Expected a string")
    case "isNumber":
      return pass(
        typeof actual === "number" && Number.isFinite(actual),
        "Expected a number",
      )
    case "isBoolean":
      return pass(typeof actual === "boolean", "Expected a boolean")
    case "isArray":
      return pass(Array.isArray(actual), "Expected an array")
    case "isObject":
      return pass(
        actual !== null && typeof actual === "object" && !Array.isArray(actual),
        "Expected an object",
      )
    case "isNull":
      return pass(actual === null, "Expected null")
    case "notNull":
      return pass(actual !== null, "Expected a non-null value")
    case "equals":
      return pass(
        isDeepStrictEqual(actual, assertion.value),
        "Expected values to be equal",
      )
    case "notEquals":
      return pass(
        !isDeepStrictEqual(actual, assertion.value),
        "Expected values to be different",
      )
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (
        typeof actual !== "number" ||
        !Number.isFinite(actual) ||
        typeof assertion.value !== "number" ||
        !Number.isFinite(assertion.value)
      ) {
        return pass(false, `Operator "${assertion.operator}" requires numbers`)
      }
      const passed =
        assertion.operator === "gt"
          ? actual > assertion.value
          : assertion.operator === "gte"
            ? actual >= assertion.value
            : assertion.operator === "lt"
              ? actual < assertion.value
              : actual <= assertion.value
      return pass(passed, `Numeric comparison "${assertion.operator}" failed`)
    }
    case "contains":
    case "notContains": {
      let contains: boolean
      if (typeof actual === "string" && typeof assertion.value === "string") {
        contains = actual.includes(assertion.value)
      } else if (Array.isArray(actual)) {
        contains = actual.some((item) =>
          isDeepStrictEqual(item, assertion.value),
        )
      } else {
        return pass(
          false,
          `Operator "${assertion.operator}" requires a string or array`,
        )
      }
      const passed = assertion.operator === "contains" ? contains : !contains
      return pass(passed, `Containment check "${assertion.operator}" failed`)
    }
    case "matches": {
      if (typeof actual !== "string" || typeof assertion.value !== "string") {
        return pass(false, 'Operator "matches" requires strings')
      }
      const compiled = compileAssertionRegex(assertion.value)
      return compiled.kind === "error"
        ? pass(false, compiled.message)
        : pass(compiled.regex.test(actual), "Regex did not match")
    }
  }
}
