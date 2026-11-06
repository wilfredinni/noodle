import type { ScriptExecutionError, ScriptSource } from "../preRequestScript"
import type { CollectionRunResult, RequestRunResult } from "./services"

function xml(value: string): string {
  return (
    value
      // XML 1.0 excludes controls, lone surrogates, and U+FFFE/U+FFFF.
      .replace(
        // oxlint-disable-next-line no-control-regex
        /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,
        "�",
      )
      .replace(/[&<>"'\t\n\r]/g, (char) => {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
          "\t": "&#9;",
          "\n": "&#10;",
          "\r": "&#13;",
        }[char]!
      })
  )
}

function seconds(milliseconds: number): string {
  return (
    Number.isFinite(milliseconds) ? Math.max(0, milliseconds) / 1000 : 0
  ).toFixed(6)
}

function origin(source?: ScriptSource): string {
  return source ? ` (${source.scope}: ${source.sourcePath ?? source.path})` : ""
}

function scriptError(error: ScriptExecutionError): string {
  return `${error.name}: ${error.message}${origin(error.source)}${error.line === undefined ? "" : `:${error.line}${error.column === undefined ? "" : `:${error.column}`}`}`
}

function diagnostics(result: RequestRunResult): string {
  const lines = [
    `Request: ${result.method} ${result.id}`,
    ...(result.failureCategories.length
      ? [`Failure categories: ${result.failureCategories.join(", ")}`]
      : []),
    ...(result.error ? [result.error] : []),
    ...(result.response
      ? [`HTTP: ${result.response.status} ${result.response.statusText}`]
      : []),
  ]
  for (const script of result.scripts?.results ?? []) {
    lines.push(
      `${script.phase} script: ${script.cancelled ? "cancelled" : script.success ? "passed" : "failed"}${origin(script.source)}`,
    )
    if (script.error) lines.push(scriptError(script.error))
    for (const outcome of script.persistence ?? [])
      if (outcome.status === "failed" && outcome.error)
        lines.push(`Persistence: ${scriptError(outcome.error)}`)
    for (const child of script.requests ?? [])
      if (!child.success)
        lines.push(
          `Child ${child.kind}${child.requestId ? ` ${child.requestId}` : ""}: ${child.cancelled ? "cancelled" : child.failureCategories.join(", ")}${child.status === undefined ? "" : `, HTTP ${child.status}`}${child.error ? `: ${scriptError(child.error)}` : ""}`,
        )
  }
  for (const capture of result.captures?.results ?? [])
    if (!capture.success)
      lines.push(
        `Capture $${capture.variable} <- ${capture.expression}: ${capture.failureReason}: ${capture.message}`,
      )
  for (const assertion of result.assertions?.results ?? [])
    if (!assertion.passed)
      lines.push(
        `Assertion ${assertion.expression} ${assertion.operator}: ${assertion.message}`,
        ...(assertion.expected === undefined
          ? []
          : [`Expected: ${JSON.stringify(assertion.expected)}`]),
        ...(assertion.actual === undefined
          ? []
          : [`Actual: ${JSON.stringify(assertion.actual)}`]),
      )
  for (const test of result.tests?.results ?? [])
    if (!test.passed)
      lines.push(`Test ${test.name}${origin(test.source)}: ${test.message}`)
  for (const error of result.tests?.errors ??
    (result.tests?.error ? [result.tests.error] : []))
    lines.push(`Test script: ${scriptError(error)}`)
  for (const group of ["scripts", "captures", "assertions", "tests"] as const)
    if (result[group]?.evaluated === false)
      lines.push(`${group}: not evaluated`)
  for (const warning of result.warnings ?? []) lines.push(`Warning: ${warning}`)
  return lines.join("\n")
}

export function renderJUnitReport(data: CollectionRunResult): string {
  let failures = 0
  let errors = 0
  let skipped = 0
  const stageOrder = { setup: 0, main: 1, teardown: 2 }
  const entries = [...data.results, ...data.skipped].sort(
    (a, b) =>
      (a.iteration ?? 0) - (b.iteration ?? 0) ||
      stageOrder[a.stage ?? "main"] - stageOrder[b.stage ?? "main"],
  )
  const cases = entries.map((entry) => {
    const result = "ok" in entry ? entry : undefined
    const name = `${entry.id}${entry.iteration === undefined ? "" : ` [iteration ${entry.iteration + 1}]`}${entry.stage ? ` [${entry.stage}]` : ""}`
    const content: string[] = []
    const reason =
      "reason" in entry
        ? entry.reason
        : result?.cancelled
          ? "cancelled"
          : undefined
    if (reason) {
      skipped++
      content.push(`<skipped message="${xml(reason)}">${xml(reason)}</skipped>`)
      if (result)
        content.push(`<system-err>${xml(diagnostics(result))}</system-err>`)
    } else if (result && !result.ok) {
      const isError =
        result.failureCategories.some((category) =>
          ["configuration", "execution", "script", "transport"].includes(
            category,
          ),
        ) || !!(result.tests?.errors?.length || result.tests?.error)
      const tag = isError ? "error" : "failure"
      if (isError) errors++
      else failures++
      const categories = result.failureCategories.join(", ") || "execution"
      content.push(
        `<${tag} type="${xml(categories)}" message="${xml(result.error ?? categories)}">${xml(diagnostics(result))}</${tag}>`,
      )
    }
    if (result) {
      const logs = [
        ...(result.scripts?.results.flatMap((script) =>
          script.logs.map(
            (log) =>
              `${script.phase} ${log.level}${origin(log.source ?? script.source)}: ${log.message}`,
          ),
        ) ?? []),
        ...(result.tests?.logs.map(
          (log) => `tests ${log.level}${origin(log.source)}: ${log.message}`,
        ) ?? []),
      ]
      if (logs.length)
        content.push(`<system-out>${xml(logs.join("\n"))}</system-out>`)
    }
    return `    <testcase classname="noodle.collection" name="${xml(name)}" time="${seconds(result?.durationMs ?? result?.response?.timeMs ?? 0)}">${content.join("")}</testcase>`
  })
  if (data.failure) {
    errors++
    cases.push(
      `    <testcase classname="noodle.collection" name="Collection configuration" time="0.000000"><error type="configuration" message="${xml(data.failure.message)}">${xml(data.failure.message)}</error></testcase>`,
    )
  }
  const counts = `tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${seconds(data.summary.durationMs)}"`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites ${counts}>`,
    `  <testsuite name="Noodle collection run" ${counts}>`,
    ...(data.cancelled
      ? [
          '    <properties><property name="cancelled" value="true"/></properties>',
        ]
      : []),
    ...cases,
    ...(data.warnings?.length
      ? [`    <system-err>${xml(data.warnings.join("\n"))}</system-err>`]
      : []),
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n")
}
