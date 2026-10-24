import { describe, expect, it } from "bun:test"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { summarizeRun, type RequestRunResult } from "../../src/app/services"
import {
  retainRunnerSnapshot,
  RUNNER_RETENTION_NOTICE,
  runnerRequestDeclarations,
  runnerDisplayItems,
  type RunnerConfiguration,
} from "../../src/runnerSession"
import {
  resolveRunnerSource,
  runnerResultSources,
} from "../../src/ui/runnerSource"
import type { Collection, Request } from "../../src/schema"
import type { ScriptSource } from "../../src/preRequestScript"

const request: Request = {
  id: "folder/request",
  name: "Original",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
  scripts: { pre: "secret script source" },
}
const collection: Collection = {
  id: "test",
  name: "test",
  items: [
    {
      type: "folder",
      data: {
        id: "folder",
        path: "folder",
        name: "Folder",
        children: [{ type: "request", data: request }],
      },
    },
  ],
}
const configuration: RunnerConfiguration = {
  scope: null,
  selectedIds: [request.id],
  environmentName: "dev",
  includeTags: [],
  excludeTags: [],
  failFast: false,
  delayMs: 0,
  dataPath: "",
  noProxy: true,
  insecure: false,
}

describe("Runner snapshots", () => {
  it.each([400, 1000])(
    "shares one payload budget across %i results and detail previews while keeping every row",
    (count) => {
      const body = "b".repeat(10_000)
      const log = "l".repeat(count === 1000 ? 8004 : 9800)
      const results: RequestRunResult[] = Array.from(
        { length: count },
        (_, iteration) => ({
          id: request.id,
          iteration,
          method: "GET",
          url: request.url,
          ok: true,
          failureCategories: [],
          tests: {
            evaluated: true,
            results: [],
            logs: [{ level: "log", message: log }],
          },
        }),
      )
      const entry = buildTimelineEntry(
        { ...request, body, bodyType: "json" },
        {
          status: "done",
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body,
            timeMs: 1,
          },
        },
      )
      const retained = retainRunnerSnapshot({
        configuration,
        items: runnerDisplayItems(collection.items),
        selectedKey: "399:folder/request",
        result: {
          results,
          skipped: [],
          failed: false,
          summary: summarizeRun(results, count, 0, performance.now()),
        },
        details: new Map(
          results.map((row) => [
            `${row.iteration}:${row.id}`,
            { requestId: row.id, iteration: row.iteration, entry },
          ]),
        ),
      })
      const payload =
        JSON.stringify(
          retained.result.results.map((row) => ({
            scripts: row.scripts,
            tests: row.tests,
            captures: row.captures,
            assertions: row.assertions,
          })),
        ) +
        JSON.stringify(
          [...retained.details.values()].map((detail) => ({
            body: detail.entry.request.body,
            response: detail.entry.response?.body,
            network: detail.entry.network,
          })),
        )
      expect(new TextEncoder().encode(payload).length).toBeLessThan(
        5 * 1024 * 1024,
      )
      expect(retained.result.results).toHaveLength(count)
      expect(retained.result.results[0]!.tests?.logs[0]?.message).toBe(log)
      expect(retained.details.size).toBe(count)
      expect(retained.details.get("399:folder/request")!.entry.request.id).toBe(
        request.id,
      )
      expect(
        retained.details.get("399:folder/request")!.entry.response?.status,
      ).toBe(200)
      expect(
        retained.details.get("399:folder/request")!.entry.request.body,
      ).toBeUndefined()
      expect(
        retained.details.get("399:folder/request")!.entry.response?.body,
      ).toBeUndefined()
      expect(
        new TextEncoder().encode(
          JSON.stringify({ ...retained, details: [...retained.details] }),
        ).length,
      ).toBeLessThanOrEqual(5 * 1024 * 1024)
      expect(retained.selectedKey).toBe("399:folder/request")
    },
  )

  it("reserves failure summaries, declarations and origins before noisy results use the budget", () => {
    const source: ScriptSource = {
      scope: "folder",
      scopeId: "folder",
      path: "folder/folder.yml",
      sourceKind: "external",
      sourcePath: "./post.js",
    }
    const declarations = runnerRequestDeclarations({
      ...request,
      assertions: [{ expression: "status", operator: "equals", value: 200 }],
      captures: { token: { value: "body.token", enabled: true } },
    })
    const results: RequestRunResult[] = Array.from(
      { length: 1000 },
      (_, iteration) => ({
        id: request.id,
        iteration,
        method: "GET",
        url: "https://example.com/" + "u".repeat(20_000),
        ok: true,
        failureCategories: [],
        tests: {
          evaluated: true,
          results: [],
          logs: [{ level: "log", message: "log".repeat(3000) }],
        },
      }),
    )
    results[998] = {
      ...results[998]!,
      ok: false,
      failureCategories: ["script"],
      scripts: {
        evaluated: true,
        results: [
          {
            phase: "post",
            scope: "folder",
            sourceKind: "external",
            source,
            success: false,
            durationMs: 1,
            logs: [],
            error: {
              name: "Error",
              message: "post failed: " + "😀".repeat(10_000),
              source,
            },
          },
        ],
      },
    }
    results[999] = {
      ...results[999]!,
      ok: false,
      failureCategories: ["transport"],
      error: "Connection refused",
      warnings: ["Proxy unavailable"],
    }
    const entry = buildTimelineEntry(request, {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "preview".repeat(1000),
        timeMs: 1,
      },
    })
    const saved = retainRunnerSnapshot({
      configuration,
      items: runnerDisplayItems(collection.items),
      selectedKey: "999:folder/request",
      result: {
        results,
        skipped: [],
        failed: true,
        summary: summarizeRun(results, 1000, 0, performance.now()),
      },
      details: new Map(
        results.map((row) => [
          `${row.iteration}:${row.id}`,
          {
            requestId: row.id,
            iteration: row.iteration,
            request: declarations,
            entry: { ...entry, request: { ...entry.request, url: row.url } },
          },
        ]),
      ),
    })
    expect(saved.result.results).toHaveLength(1000)
    expect(saved.details.size).toBe(1000)
    expect(saved.selectedKey).toBe("999:folder/request")
    expect(saved.result.results[999]!.error).toBe("Connection refused")
    expect(saved.result.results[999]!.warnings).toEqual(["Proxy unavailable"])
    const last = saved.details.get("999:folder/request")!
    expect(last.entry.error?.message).toBe("Connection refused")
    expect(last.request).toEqual(declarations)
    expect(last.retention?.resultsOmitted).toBe(true)
    expect(last.entry.request.url.length).toBeLessThan(600)
    expect(saved.result.results[999]!.url.length).toBeLessThan(600)
    const script = saved.details.get("998:folder/request")!.retention!
    expect(script.failure).toStartWith("post failed:")
    expect(script.failure).not.toContain("�")
    expect(new TextEncoder().encode(script.failure).length).toBeLessThanOrEqual(
      515,
    )
    expect(runnerResultSources(saved.result.results[998], 0, script)).toEqual([
      { tab: "postScript", source },
    ])
    expect(saved.result.warnings).toContain(RUNNER_RETENTION_NOTICE)
    expect(
      new TextEncoder().encode(
        JSON.stringify({ ...saved, details: [...saved.details] }),
      ).length,
    ).toBeLessThanOrEqual(5 * 1024 * 1024)
  })

  it("charges configuration and display metadata before retaining optional diagnostics", () => {
    const results: RequestRunResult[] = [
      {
        id: request.id,
        method: "GET",
        url: request.url,
        ok: true,
        failureCategories: [],
        tests: {
          evaluated: true,
          results: [],
          logs: [{ level: "log", message: "extra diagnostics" }],
        },
      },
    ]
    const saved = retainRunnerSnapshot({
      configuration: {
        ...configuration,
        selectedIds: Array.from(
          { length: 2000 },
          (_, i) => `${i}-${"s".repeat(1000)}`,
        ),
      },
      items: [
        {
          type: "request",
          data: {
            id: request.id,
            name: "n".repeat(4 * 1024 * 1024),
            method: "GET",
          },
        },
      ],
      result: {
        results,
        skipped: [],
        failed: false,
        summary: summarizeRun(results, 1, 0, performance.now()),
      },
      details: new Map(),
    })
    expect(saved.result.results[0]!.tests).toBeUndefined()
    expect(saved.result.results[0]!.id).toBe(request.id)
    expect(saved.result.warnings).toContain(RUNNER_RETENTION_NOTICE)
  })

  it("retains redacted, bounded previews and diagnostics without live sources or duplicate bodies", () => {
    const body = "a".repeat(9999) + "😀" + "sensitive"
    const execution = {
      tests: {
        evaluated: true,
        results: [],
        logs: [
          { level: "log" as const, message: "safe log" },
          { level: "log" as const, message: "x".repeat(11000) },
        ],
      },
      captures: {
        evaluated: true,
        results: [
          {
            variable: "large",
            expression: "body",
            success: true as const,
            value: "v".repeat(11000),
            type: "string" as const,
          },
        ],
      },
    }
    const entry = buildTimelineEntry(
      request,
      {
        status: "done",
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body,
          timeMs: 1,
        },
        execution,
      },
      "dev",
      undefined,
      ["sensitive"],
    )
    const result: RequestRunResult = {
      id: request.id,
      method: "GET",
      url: request.url,
      ok: true,
      failureCategories: [],
      ...execution,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: entry.response!.body,
        timeMs: 1,
      },
    }
    const retained = retainRunnerSnapshot({
      configuration,
      items: runnerDisplayItems(collection.items),
      result: {
        results: [result],
        skipped: [],
        failed: false,
        summary: summarizeRun([result], 1, 0, performance.now()),
      },
      details: new Map([[request.id, { requestId: request.id, entry }]]),
    })
    const saved = retained.details.get(request.id)!.entry
    expect(saved.response!.body).toBe("a".repeat(9999))
    expect(saved.response!.bodyTruncated).toBe(true)
    expect(saved.response!.size).toBe(new TextEncoder().encode(body).length)
    expect(saved.response!.bodyRef).toBeUndefined()
    expect(retained.result.results[0]!.response!.body).toBeUndefined()
    expect(saved.tests!.logs).toEqual([
      { level: "log", message: "safe log" },
      { level: "warn", message: "[TRUNCATED]" },
    ])
    expect(retained.result.results[0]!.captures!.results[0]).toMatchObject({
      value: "[TRUNCATED]",
      success: true,
    })
    expect(JSON.stringify(retained)).not.toContain("secret script source")
    expect(JSON.stringify(saved)).not.toContain("sensitive")
    request.name = "Edited"
    configuration.selectedIds.push("another")
    expect(retained.items[0]!.data).toMatchObject({
      children: [{ data: { name: "Original" } }],
    })
    expect(retained.configuration.selectedIds).toEqual([request.id])
    request.name = "Original"
    configuration.selectedIds.pop()
  })

  it("retains binary metadata without bytes", () => {
    const entry = buildTimelineEntry(request, {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "image/png" },
        body: "",
        bodyKind: "binary",
        timeMs: 1,
      },
    })
    expect(entry.response?.body).toBeUndefined()
    const retained = retainRunnerSnapshot({
      configuration,
      items: [],
      result: {
        results: [],
        skipped: [],
        failed: false,
        summary: summarizeRun([], 0, 0, performance.now()),
      },
      details: new Map([[request.id, { requestId: request.id, entry }]]),
    })
    expect(retained.details.get(request.id)!.entry.response).toMatchObject({
      bodyKind: "binary",
      contentType: "image/png",
    })
    expect(
      retained.details.get(request.id)!.entry.response?.body,
    ).toBeUndefined()
  })
})

describe("Runner source destinations", () => {
  const folder: ScriptSource = {
    scope: "folder",
    scopeId: "folder",
    path: "folder/folder.yml",
    sourceKind: "external",
    sourcePath: "./missing.js",
  }
  const root: ScriptSource = {
    scope: "collection",
    scopeId: "test",
    path: "settings.yml",
  }
  it("resolves general requests and the actual inherited source without guessing moved paths", () => {
    expect(resolveRunnerSource(collection, request.id)).toEqual({
      scope: "request",
      id: request.id,
      tab: undefined,
    })
    expect(
      resolveRunnerSource(collection, request.id, {
        tab: "postScript",
        source: folder,
      }),
    ).toEqual({ scope: "folder", id: "folder", tab: "postScript" })
    expect(
      resolveRunnerSource(collection, request.id, {
        tab: "tests",
        source: root,
      }),
    ).toEqual({ scope: "collection", tab: "tests" })
    expect(resolveRunnerSource(collection, "renamed")).toBeNull()
    expect(
      resolveRunnerSource(collection, request.id, {
        tab: "tests",
        source: { ...folder, scopeId: "deleted" },
      }),
    ).toBeNull()
    expect(
      resolveRunnerSource({ ...collection, items: [] }, request.id),
    ).toBeNull()
  })
  it("keeps each script/test origin selectable and deduplicates aggregate errors", () => {
    const tests = {
      evaluated: true,
      results: [
        {
          name: "failure",
          passed: false,
          durationMs: 1,
          message: "fail",
          source: folder,
        },
      ],
      logs: [],
      errors: [root, folder, root].map((source) => ({
        name: "Error",
        message: "fail",
        source,
      })),
    }
    expect(runnerResultSources({ tests }, 0)).toEqual([
      { tab: "tests", source: root },
      { tab: "tests", source: folder },
    ])
    expect(runnerResultSources({ tests }, 1)).toEqual([
      { tab: "tests", source: folder },
    ])
    expect(
      runnerResultSources(
        {
          scripts: {
            evaluated: true,
            results: [
              {
                phase: "post",
                scope: "folder",
                source: folder,
                sourceKind: "external",
                success: false,
                logs: [],
                durationMs: 1,
              },
            ],
          },
        },
        0,
      ),
    ).toEqual([{ tab: "postScript", source: folder }])
  })
})
