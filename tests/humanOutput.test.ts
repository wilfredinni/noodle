import { describe, expect, it } from "bun:test"
import {
  formatCollectionAudit,
  formatCollectionInspect,
  formatCollectionRun,
  formatCollectionList,
  formatCookieClear,
  formatCookieList,
  formatImport,
  formatRequestRun,
  formatWorkspaceAudit,
  formatWorkspaceList,
} from "../src/app/humanOutput"

function plain(text: string): string {
  return text.replace(
    new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
    "",
  )
}

describe("human CLI output", () => {
  it("renders an empty workspace without JSON", () => {
    expect(formatWorkspaceList({ collections: [] })).toBe(
      "No registered collections.",
    )
  })

  it("explains when an audit has no registered collections", () => {
    expect(
      formatWorkspaceAudit({
        valid: true,
        collections: [],
        issues: [],
      }),
    ).toBe("No registered collections.")
  })

  it("renders collection trees for list and inspect", () => {
    const tree = [
      {
        type: "folder" as const,
        path: "users",
        name: "Users",
        children: [
          {
            type: "request" as const,
            id: "users/list",
            name: "List users",
            method: "GET" as const,
            url: "https://example.com/users",
          },
        ],
      },
    ]
    expect(plain(formatCollectionList({ path: "/tmp/demo", tree }))).toBe(
      "Collection: /tmp/demo\n└─ Users\n  └─ GET List users https://example.com/users",
    )
    expect(
      plain(
        formatCollectionInspect({
          path: "/tmp/demo",
          requestCount: 1,
          folderCount: 1,
          environments: ["development"],
          settings: { environment: "development" },
          tree,
        }),
      ),
    ).toContain("Requests: 1  Folders: 1")
  })

  it("renders audit issues with their file context", () => {
    expect(
      plain(
        formatCollectionAudit({
          path: "/tmp/demo",
          valid: false,
          issues: [
            {
              kind: "request",
              path: "bad.yml",
              message: "missing url",
              fixed: false,
            },
          ],
        }),
      ),
    ).toBe("✗ Found 1 issue\n  /tmp/demo\n  error request bad.yml: missing url")
  })

  it("summarizes request and collection runs without response bodies", () => {
    const successful = {
      id: "users/list",
      method: "GET" as const,
      url: "https://example.com/users",
      ok: true,
      failureCategories: [],
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: '{"users":[]}',
        timeMs: 14,
      },
    }
    const failed = {
      id: "users/create",
      method: "POST" as const,
      url: "https://example.com/users",
      ok: false,
      failureCategories: ["transport" as const],
      error: "connect ECONNREFUSED",
    }
    expect(plain(formatRequestRun({ result: successful }))).toBe(
      "✓ GET users/list  200 OK  14ms\n  https://example.com/users",
    )
    const output = plain(
      formatCollectionRun({
        results: [successful, failed],
        skipped: [],
        failed: true,
        summary: {
          selected: 2,
          executed: 2,
          skipped: 0,
          requestSuccesses: 1,
          requestFailures: 1,
          assertionPasses: 0,
          assertionFailures: 0,
          captureFailures: 0,
          durationMs: 14,
          failureCategories: ["transport"],
        },
      }),
    )
    expect(output).toContain(
      "Summary: 1 passed, 1 failed, 2/2 executed, 0 skipped, 14ms",
    )
    expect(output).toContain("Failure: transport error")
    expect(output).not.toContain('{"users":[]}')
  })

  it("summarizes assertions without printing raw actual values", () => {
    const output = plain(
      formatRequestRun({
        result: {
          id: "users/get",
          method: "GET",
          url: "https://example.com/users/1",
          ok: false,
          failureCategories: ["assertion"],
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: '{"token":"raw-server-secret"}',
            timeMs: 2,
          },
          assertions: {
            evaluated: true,
            results: [
              {
                expression: "status",
                operator: "equals",
                expected: 200,
                actual: 200,
                passed: true,
                message: "Assertion passed",
              },
              {
                expression: "body.token",
                operator: "equals",
                expected: "[REDACTED]",
                actual: "raw-server-secret",
                passed: false,
                message: "Expected values to be equal",
              },
            ],
          },
        },
      }),
    )

    expect(output).toContain("Assertions: 1 passed, 1 failed")
    expect(output).toContain("Failure: assertion failure")
    expect(output).toContain("✗ body.token equals: Expected values to be equal")
    expect(output).not.toContain("raw-server-secret")
  })

  it("reports assertions that could not be evaluated", () => {
    expect(
      plain(
        formatRequestRun({
          result: {
            id: "users/get",
            method: "GET",
            url: "https://example.com/users/1",
            ok: false,
            failureCategories: ["execution"],
            error: "unresolved variable",
            assertions: { evaluated: false, results: [] },
          },
        }),
      ),
    ).toContain("Assertions: not evaluated")
  })

  it("summarizes captures without printing captured values", () => {
    const output = plain(
      formatRequestRun({
        result: {
          id: "users/get",
          method: "GET",
          url: "https://example.com/users/1",
          ok: false,
          failureCategories: ["capture"],
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: '{"token":"raw-captured-value"}',
            timeMs: 2,
          },
          captures: {
            evaluated: true,
            results: [
              {
                variable: "token",
                expression: "body.token",
                success: true,
                type: "string",
                value: "raw-captured-value",
                persisted: "environment",
              },
              {
                variable: "user_id",
                expression: "body.user.id",
                success: false,
                failureReason: "missing",
                message: 'Expression "body.user.id" is missing',
              },
            ],
          },
        },
      }),
    )

    expect(output).toContain("Captures: 1 captured, 1 failed")
    expect(output).toContain("Failure: capture failure")
    expect(output).toContain("✓ $token <- body.token (environment)")
    expect(output).toContain(
      '✗ $user_id <- body.user.id: Expression "body.user.id" is missing',
    )
    expect(output).not.toContain("raw-captured-value")
  })

  it("reports captures that could not be evaluated", () => {
    expect(
      plain(
        formatRequestRun({
          result: {
            id: "users/get",
            method: "GET",
            url: "https://example.com/$user_id",
            ok: false,
            failureCategories: ["execution"],
            error: "unresolved variable",
            captures: { evaluated: false, results: [] },
          },
        }),
      ),
    ).toContain("Captures: not evaluated")
  })

  it("prints cookie warnings, storage state, and recovery backups", () => {
    const listed = plain(
      formatCookieList({
        disabled: false,
        state: "plaintext-warning",
        warnings: ["Credential vault unavailable"],
        cookies: [
          {
            name: "session",
            value: "abc",
            domain: "example.com",
            path: "/",
            expires: null,
            secure: true,
            httpOnly: true,
            hostOnly: true,
          },
        ],
      }),
    )
    expect(listed).toContain("Storage: plaintext-warning")
    expect(listed).toContain("warning: Credential vault unavailable")
    expect(listed).toContain("HostOnly")
    expect(
      plain(
        formatCookieClear({
          disabled: false,
          state: "encrypted",
          warnings: [],
          backupPath: "/tmp/cookies.backup",
        }),
      ),
    ).toContain("Backup: /tmp/cookies.backup")
  })

  it("prints non-fatal cookie warnings for request and collection runs", () => {
    const warning = "Cookie storage is unavailable"
    const result = {
      id: "users/list",
      method: "GET" as const,
      url: "https://example.com/users",
      ok: true,
      failureCategories: [],
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 1,
      },
      warnings: [warning],
    }
    expect(plain(formatRequestRun({ result }))).toContain(`warning: ${warning}`)
    expect(
      plain(
        formatCollectionRun({
          results: [result],
          skipped: [],
          failed: false,
          summary: {
            selected: 1,
            executed: 1,
            skipped: 0,
            requestSuccesses: 1,
            requestFailures: 0,
            assertionPasses: 0,
            assertionFailures: 0,
            captureFailures: 0,
            durationMs: 1,
            failureCategories: [],
          },
          warnings: [warning],
        }),
      ),
    ).toContain(`warning: ${warning}`)
  })

  it("renders imported collections as a confirmation", () => {
    expect(
      plain(
        formatImport({
          name: "Petstore",
          path: "/tmp/petstore",
          formattedJsonBodies: 2,
        }),
      ),
    ).toBe(
      "✓ Imported Petstore\n  /tmp/petstore\n  Pretty-printed 2 JSON bodies",
    )
  })
})
