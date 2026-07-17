import { describe, expect, it } from "bun:test"
import {
  formatCollectionAudit,
  formatCollectionInspect,
  formatCollectionRun,
  formatCollectionList,
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
      error: "connect ECONNREFUSED",
    }
    expect(plain(formatRequestRun({ result: successful }))).toBe(
      "✓ GET users/list  200 OK  14ms\n  https://example.com/users",
    )
    const output = plain(
      formatCollectionRun({
        results: [successful, failed],
        failed: true,
      }),
    )
    expect(output).toContain("Summary: 1 passed, 1 failed, 14ms")
    expect(output).not.toContain('{"users":[]}')
  })

  it("renders imported collections as a confirmation", () => {
    expect(
      plain(formatImport({ name: "Petstore", path: "/tmp/petstore" })),
    ).toBe("✓ Imported Petstore\n  /tmp/petstore")
  })
})
