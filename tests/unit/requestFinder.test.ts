import { describe, expect, it } from "bun:test"
import type { Environment, Request } from "../../src/schema"
import {
  requestFinderItems,
  resolveFinderUrl,
  searchRequests,
} from "../../src/ui/requestFinder"

const requests: Request[] = [
  {
    id: "users/get-user",
    name: "Get User",
    method: "GET",
    url: "https://api.example.com/users/$USER_ID",
    headers: {},
    params: [],
    timeout: 0,
  },
  {
    id: "admin/create-user",
    name: "Create User",
    method: "POST",
    url: "https://api.example.com/admin/users",
    headers: {},
    params: [],
    timeout: 0,
  },
  {
    id: "health",
    name: "Health check",
    method: "HEAD",
    url: "https://status.example.com/healthz",
    headers: {},
    params: [],
    timeout: 0,
  },
]

const devEnv: Environment = {
  name: "development",
  vars: { API_HOST: "dev.api.example.com", USER_ID: "42" },
}

describe("requestFinder", () => {
  it("shows all requests for an empty query and derives folders", () => {
    const items = requestFinderItems(requests)
    expect(searchRequests(items, "")).toHaveLength(3)
    expect(items[0]?.folderPath).toBe("users")
    expect(items[2]?.folderPath).toBe("(root)")
  })

  it("matches name, path, method, and URL case-insensitively", () => {
    const items = requestFinderItems(requests)
    expect(searchRequests(items, "get user")[0]?.request.id).toBe(
      "users/get-user",
    )
    expect(searchRequests(items, "ADMIN")[0]?.request.id).toBe(
      "admin/create-user",
    )
    expect(searchRequests(items, "post")[0]?.request.id).toBe(
      "admin/create-user",
    )
    expect(searchRequests(items, "healthz")[0]?.request.id).toBe("health")
  })

  it("requires every whitespace-separated token and supports fuzzy matching", () => {
    const items = requestFinderItems(requests)
    expect(searchRequests(items, "g usr")[0]?.request.id).toBe("users/get-user")
    expect(searchRequests(items, "get missing")).toEqual([])
  })

  it("ranks a direct request-name match above a URL-only match", () => {
    const items = requestFinderItems([
      requests[0]!,
      {
        ...requests[2]!,
        name: "Users status",
        url: "https://example.com/other",
      },
    ])
    expect(searchRequests(items, "users")[0]?.request.name).toBe("Users status")
  })

  it("matches a URL resolved with the active environment", () => {
    const items = requestFinderItems(
      [{ ...requests[0]!, url: "https://$API_HOST/users/$USER_ID" }],
      devEnv,
    )
    expect(items[0]?.resolvedUrl).toBe("https://dev.api.example.com/users/42")
    expect(searchRequests(items, "dev.api")[0]?.request.id).toBe(
      "users/get-user",
    )
  })

  it("keeps missing variables searchable and does not require an environment", () => {
    const url = "https://$MISSING.example.com/$USER_ID"
    expect(resolveFinderUrl(url, devEnv)).toBe(
      "https://$MISSING.example.com/42",
    )
    expect(resolveFinderUrl(url, null)).toBe(url)

    const items = requestFinderItems([{ ...requests[0]!, url }], devEnv)
    expect(searchRequests(items, "missing")[0]?.request.id).toBe(
      "users/get-user",
    )
  })
})
