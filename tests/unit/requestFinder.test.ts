import { describe, expect, it } from "bun:test"
import type { CollectionItem, Environment, Request } from "../../src/schema"
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

const jsonPlaceholderEnv: Environment = {
  name: "jsonplaceholder",
  vars: { base_url: "https://jsonplaceholder.typicode.com" },
}

describe("requestFinder", () => {
  it("does not resolve declared secrets in finder URLs", () => {
    expect(
      resolveFinderUrl("https://example.com/$TOKEN/$PUBLIC", {
        name: "dev",
        vars: { TOKEN: "secret", PUBLIC: "visible" },
        secretVars: { TOKEN: "keychain" },
      }),
    ).toBe("https://example.com/$TOKEN/visible")
  })
  it("shows all requests for an empty query and derives folders", () => {
    const items = requestFinderItems(requests)
    expect(searchRequests(items, "")).toHaveLength(3)
    expect(items[0]?.folderPath).toBe("users")
    expect(items[2]?.folderPath).toBe("(root)")
  })

  it("matches name, path, method, and URL case-insensitively", () => {
    const items = requestFinderItems(requests)
    expect(searchRequests(items, "get user")[0]?.id).toBe("users/get-user")
    expect(searchRequests(items, "ADMIN")[0]?.id).toBe("admin/create-user")
    expect(searchRequests(items, "post")[0]?.id).toBe("admin/create-user")
    expect(searchRequests(items, "healthz")[0]?.id).toBe("health")
  })

  it("searches and exposes direct and inherited request tags", () => {
    const items = requestFinderItems([
      {
        type: "folder",
        data: {
          id: "folder",
          name: "Folder",
          path: "folder",
          tags: ["smoke"],
          children: [
            {
              type: "request",
              data: { ...requests[0]!, tags: ["critical"] },
            },
          ],
        },
      },
    ])
    const request = items.find((item) => item.type === "request")
    expect(request?.type === "request" && request.tags).toEqual([
      "smoke",
      "critical",
    ])
    expect(searchRequests(items, "#smoke")[0]?.id).toBe("users/get-user")
    expect(searchRequests(items, "critical")[0]?.id).toBe("users/get-user")
  })

  it("requires every whitespace-separated token and supports fuzzy matching", () => {
    const items = requestFinderItems(requests)
    expect(searchRequests(items, "g usr")[0]?.id).toBe("users/get-user")
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
    expect(searchRequests(items, "users")[0]?.name).toBe("Users status")
  })

  it("matches a URL resolved with the active environment", () => {
    const items = requestFinderItems(
      [{ ...requests[0]!, url: "https://$API_HOST/users/$USER_ID" }],
      devEnv,
    )
    expect(items[0]?.type === "request" && items[0].resolvedUrl).toBe(
      "https://dev.api.example.com/users/42",
    )
    expect(searchRequests(items, "dev.api")[0]?.id).toBe("users/get-user")
  })

  it("keeps missing variables searchable and does not require an environment", () => {
    const url = "https://$MISSING.example.com/$USER_ID"
    expect(resolveFinderUrl(url, devEnv)).toBe(
      "https://$MISSING.example.com/42",
    )
    expect(resolveFinderUrl(url, null)).toBe(url)

    const items = requestFinderItems([{ ...requests[0]!, url }], devEnv)
    expect(searchRequests(items, "missing")[0]?.id).toBe("users/get-user")
  })

  it("fuzzy-matches tokens spread across name", () => {
    const items = requestFinderItems([
      {
        id: "a",
        name: "Create User",
        method: "GET",
        url: "https://x.com/a",
        headers: {},
        params: [],
        timeout: 0,
      },
      {
        id: "b",
        name: "Delete Item",
        method: "GET",
        url: "https://x.com/b",
        headers: {},
        params: [],
        timeout: 0,
      },
    ])
    expect(searchRequests(items, "crt")[0]?.id).toBe("a")
  })

  it("fuzzy-matches tokens spread across id", () => {
    const items = requestFinderItems([
      {
        id: "users/create",
        name: "Create",
        method: "GET",
        url: "https://x.com/a",
        headers: {},
        params: [],
        timeout: 0,
      },
      {
        id: "items/delete",
        name: "Delete",
        method: "GET",
        url: "https://x.com/b",
        headers: {},
        params: [],
        timeout: 0,
      },
    ])
    expect(searchRequests(items, "crt")[0]?.id).toBe("users/create")
  })

  it("does NOT fuzzy-match on URL or resolvedUrl", () => {
    const items = requestFinderItems(
      [
        {
          id: "test",
          name: "Example",
          method: "GET",
          url: "$base_url/todos",
          headers: {},
          params: [],
          timeout: 0,
        },
      ],
      jsonPlaceholderEnv,
    )
    expect(searchRequests(items, "todo")[0]?.id).toBe("test")
    expect(searchRequests(items, "photo")).toEqual([])
  })

  it("direct substring still matches on URL and resolvedUrl", () => {
    const items = requestFinderItems(
      [
        {
          id: "test",
          name: "Example",
          method: "GET",
          url: "$base_url/photos/1",
          headers: {},
          params: [],
          timeout: 0,
        },
      ],
      jsonPlaceholderEnv,
    )
    expect(searchRequests(items, "photo")[0]?.id).toBe("test")
  })

  it("indexes and matches folder items alongside request items", () => {
    const collectionItems: CollectionItem[] = [
      {
        type: "folder",
        data: {
          id: "auth-id",
          name: "Auth",
          path: "auth",
          children: [
            {
              type: "folder",
              data: {
                id: "v1-id",
                name: "v1 API",
                path: "auth/v1",
                children: [
                  {
                    type: "request",
                    data: requests[0]!,
                  },
                ],
              },
            },
          ],
        },
      },
      {
        type: "request",
        data: requests[2]!,
      },
    ]

    const items = requestFinderItems(collectionItems)
    expect(items).toHaveLength(4) // 2 requests + 2 folders

    const folderItem = items.find(
      (i) => i.type === "folder" && i.id === "auth/v1",
    )
    expect(folderItem).toBeDefined()
    if (folderItem && folderItem.type === "folder") {
      expect(folderItem.name).toBe("v1 API")
      expect(folderItem.folderPath).toBe("auth")
      expect(folderItem.requestCount).toBe(1)
    }

    const matchedFolder = searchRequests(items, "v1 api")
    expect(matchedFolder[0]?.id).toBe("auth/v1")

    const folderTokenMatches = searchRequests(items, "folder")
    expect(folderTokenMatches.every((i) => i.type === "folder")).toBe(true)
    expect(folderTokenMatches).toHaveLength(2)
  })
})
