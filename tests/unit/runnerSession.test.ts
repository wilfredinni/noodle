import { describe, expect, it } from "bun:test"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { summarizeRun, type RequestRunResult } from "../../src/app/services"
import {
  retainRunnerSnapshot,
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
