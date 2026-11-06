import { describe, expect, it } from "bun:test"
import { renderJUnitReport } from "../../src/app/junitReport"
import { serializeCommandResult } from "../../src/app/commandResult"
import {
  summarizeRun,
  type CollectionRunResult,
  type RequestRunResult,
  type RunFailureCategory,
} from "../../src/app/services"
import { parseReport, reportCases } from "./_junit"

function request(fields: Partial<RequestRunResult> = {}): RequestRunResult {
  return {
    id: "users/get",
    method: "GET",
    url: "https://example.com",
    ok: true,
    failureCategories: [],
    durationMs: 125,
    ...fields,
  }
}

function run(
  results: RequestRunResult[],
  skipped: CollectionRunResult["skipped"] = [],
): CollectionRunResult {
  return {
    results,
    skipped,
    failed: results.some((row) => !row.ok),
    summary: {
      ...summarizeRun(
        results,
        results.length + skipped.length,
        skipped.length,
        performance.now(),
      ),
      durationMs: 1500,
    },
  }
}

describe("JUnit report", () => {
  it("counts cases, preserves distinct identities and execution order, and uses seconds", () => {
    const result = run(
      [
        request({ id: "setup", iteration: 0, stage: "setup" }),
        request({
          iteration: 0,
          stage: "main",
          ok: false,
          failureCategories: ["http"],
        }),
        request({ id: "teardown", iteration: 0, stage: "teardown" }),
        request({ id: "setup", iteration: 1, stage: "setup" }),
        request({ iteration: 1, stage: "main", cancelled: true, ok: false }),
      ],
      [
        { id: "users/next", iteration: 0, stage: "main", reason: "fail-fast" },
        { id: "users/next", iteration: 1, stage: "main", reason: "cancelled" },
        {
          id: "teardown",
          iteration: 1,
          stage: "teardown",
          reason: "cancelled",
        },
      ],
    )
    result.cancelled = true
    const before = structuredClone(result)
    const text = renderJUnitReport(result)
    const root = parseReport(text)
    expect(root.attributes).toEqual({
      tests: "8",
      failures: "1",
      errors: "0",
      skipped: "4",
      time: "1.500000",
    })
    expect(root.children[0]!.attributes).toEqual({
      name: "Noodle collection run",
      ...root.attributes,
    })
    expect(reportCases(text).map((node) => node.attributes.name)).toEqual([
      "setup [iteration 1] [setup]",
      "users/get [iteration 1] [main]",
      "users/next [iteration 1] [main]",
      "teardown [iteration 1] [teardown]",
      "setup [iteration 2] [setup]",
      "users/get [iteration 2] [main]",
      "users/next [iteration 2] [main]",
      "teardown [iteration 2] [teardown]",
    ])
    expect(reportCases(text).map((node) => node.attributes.time)).toEqual([
      "0.125000",
      "0.125000",
      "0.000000",
      "0.125000",
      "0.125000",
      "0.125000",
      "0.000000",
      "0.000000",
    ])
    expect(text).toContain('name="cancelled" value="true"')
    expect(result).toEqual(before)
  })

  for (const category of [
    "configuration",
    "execution",
    "script",
    "transport",
    "http",
    "capture",
    "assertion",
    "test",
  ] as RunFailureCategory[]) {
    it(`maps ${category} without changing request counts`, () => {
      const text = renderJUnitReport(
        run([
          request({
            ok: false,
            failureCategories: [category],
            error: "diagnostic",
          }),
        ]),
      )
      const tag = [
        "configuration",
        "execution",
        "script",
        "transport",
      ].includes(category)
        ? "error"
        : "failure"
      const child = reportCases(text)[0]!.children[0]!
      expect(child.name).toBe(tag)
      expect(child.attributes.type).toBe(category)
      expect(child.text).toContain("diagnostic")
      expect(parseReport(text).attributes.tests).toBe("1")
    })
  }

  it("retains warnings on a successful testcase", () => {
    const warnings = ["OAuth <storage> unavailable", "Legacy auth & signing"]
    const report = renderJUnitReport(run([request({ warnings }), request()]))
    const [warned, quiet] = reportCases(report)
    expect(warned!.children).toHaveLength(1)
    expect(warned!.children[0]).toMatchObject({
      name: "system-err",
      text: warnings.join("\n"),
    })
    expect(quiet!.children).toHaveLength(0)
    expect(parseReport(report).attributes.failures).toBe("0")
  })

  it("retains all diagnostics in one error, including inherited test errors and child summaries", () => {
    const source = {
      scope: "folder" as const,
      path: "users/folder.yml",
      sourcePath: "./scripts/check.js",
      sourceKind: "external" as const,
    }
    const result = request({
      ok: false,
      failureCategories: ["script", "http", "capture", "assertion", "test"],
      response: {
        status: 500,
        statusText: "Server Error",
        headers: {},
        body: "DO NOT INCLUDE BODY",
        timeMs: 12,
      },
      scripts: {
        evaluated: true,
        results: [
          {
            phase: "post",
            scope: "folder",
            source,
            sourceKind: "external",
            success: false,
            durationMs: 2,
            error: { name: "Error", message: "post broke", line: 3, column: 2 },
            logs: [{ level: "warn", message: "[REDACTED]" }],
            requests: [
              {
                kind: "saved",
                requestId: "child",
                depth: 1,
                method: "GET",
                url: "DO NOT INCLUDE URL",
                durationMs: 1,
                success: false,
                status: 404,
                failureCategories: ["http"],
              },
            ],
          },
        ],
      },
      captures: {
        evaluated: true,
        results: [
          {
            variable: "id",
            expression: "body.id",
            success: false,
            failureReason: "missing",
            message: "missing id",
          },
        ],
      },
      assertions: {
        evaluated: true,
        results: [
          {
            expression: "status",
            operator: "equals",
            expected: 200,
            actual: 500,
            passed: false,
            message: "status mismatch",
          },
        ],
      },
      tests: {
        evaluated: true,
        results: [
          {
            name: "valid body",
            passed: false,
            message: "bad body",
            durationMs: 1,
            source,
          },
        ],
        logs: [],
        error: { name: "Error", message: "test broke" },
        errors: [
          { name: "Error", message: "test broke", source, line: 6 },
          { name: "Error", message: "next block broke" },
        ],
      },
    })
    const text = renderJUnitReport(run([result]))
    const node = reportCases(text)[0]!
    expect(
      node.children.filter((child) =>
        ["error", "failure"].includes(child.name),
      ),
    ).toHaveLength(1)
    for (const diagnostic of [
      "post broke",
      "Child saved child: http, HTTP 404",
      "missing id",
      "Expected: 200",
      "Actual: 500",
      "bad body",
      "test broke",
      "next block broke",
      "./scripts/check.js",
    ])
      expect(node.children[0]!.text).toContain(diagnostic)
    expect(text).not.toContain("DO NOT INCLUDE")
    expect(node.children[1]!.text).toContain("[REDACTED]")
    expect(parseReport(text).attributes).toMatchObject({
      tests: "1",
      errors: "1",
      failures: "0",
    })
    expect(
      reportCases(
        renderJUnitReport(
          run([
            request({
              ok: false,
              failureCategories: ["test"],
              tests: result.tests,
            }),
          ]),
        ),
      )[0]!.children[0]!.name,
    ).toBe("error")
  })

  it("escapes XML attributes and text, preserves Unicode and replaces invalid characters", () => {
    const value = `<tag a="x"> & ' ]]>\n\t\r café 🍜\0\u001b\ud800\ufffe`
    const clean = `${value.slice(0, -4)}����`
    const text = renderJUnitReport(
      run([
        request({
          id: value,
          ok: false,
          error: value,
          failureCategories: ["transport"],
        }),
      ]),
    )
    const node = reportCases(text)[0]!
    expect(node.attributes.name).toBe(clean)
    expect(node.children[0]!.attributes.message).toBe(clean)
    expect(node.children[0]!.text).toContain(clean)
    expect(text).not.toContain("\0")
  })

  it("represents pre-run configuration failure separately and empty successful runs accurately", () => {
    const data = run([])
    expect(parseReport(renderJUnitReport(data)).attributes).toMatchObject({
      tests: "0",
      errors: "0",
      failures: "0",
      skipped: "0",
    })
    data.failure = {
      category: "configuration",
      message: 'Missing "setup" & source',
    }
    data.failed = true
    data.summary.selected = 4
    const text = renderJUnitReport(data)
    expect(parseReport(text).attributes).toMatchObject({
      tests: "1",
      errors: "1",
      skipped: "0",
    })
    expect(reportCases(text)[0]!.children[0]!.text).toBe(data.failure.message)
  })

  it("retains completed failures on a cancelled execution without counting cancellation as failure", () => {
    const data = run(
      [
        request({
          cancelled: true,
          ok: false,
          failureCategories: ["http"],
          response: {
            status: 500,
            statusText: "Error",
            headers: {},
            timeMs: 5,
          },
          tests: { evaluated: false, results: [], logs: [] },
        }),
      ],
      [{ id: "next", reason: "setup-failed" }],
    )
    const text = renderJUnitReport(data)
    expect(parseReport(text).attributes).toMatchObject({
      tests: "2",
      errors: "0",
      failures: "0",
      skipped: "2",
    })
    expect(reportCases(text)[0]!.children[1]!.text).toContain("HTTP: 500 Error")
    expect(reportCases(text)[0]!.children[1]!.text).toContain(
      "tests: not evaluated",
    )
    expect(reportCases(text)[1]!.children[0]!.text).toBe("setup-failed")
  })

  it("uses existing HTTP timing when rendering older results", () => {
    const text = renderJUnitReport(
      run([
        request({
          durationMs: undefined,
          response: { status: 200, statusText: "OK", headers: {}, timeMs: 42 },
        }),
      ]),
    )
    expect(reportCases(text)[0]!.attributes.time).toBe("0.042000")
  })
})

it("preserves the existing envelope bytes and default errors", () => {
  expect(serializeCommandResult({ data: { value: 1 } })).toBe(
    '{"status":"success","data":{"value":1},"errors":[]}\n',
  )
  expect(serializeCommandResult({ data: null, failed: true })).toBe(
    '{"status":"error","data":null,"errors":["command failed"]}\n',
  )
})
