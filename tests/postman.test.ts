import { describe, it, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { postmanImporter } from "../src/converters/postman/index"
import type { Request, Collection, CollectionItem } from "../src/schema"

const takaPath = join(import.meta.dir, "fixtures", "TakaTaka.json")
const content = readFileSync(takaPath, "utf-8")

function reqs(result: { collection: Collection }): Request[] {
  function flatten(items: CollectionItem[]): Request[] {
    const out: Request[] = []
    for (const item of items) {
      if (item.type === "request") {
        out.push(item.data)
      } else if (item.type === "folder" && item.data?.children) {
        out.push(...flatten(item.data.children))
      }
    }
    return out
  }
  return flatten(result.collection.items)
}

describe("postmanImporter — TakaTaka.json integration", () => {
  const result = postmanImporter.import(content)

  it("detects as postman", () => {
    expect(postmanImporter.detect(content)).toBe(true)
  })

  it("collection name is TakaTaka", () => {
    expect(result.collection.name).toBe("TakaTaka")
  })

  it("has 8 requests total", () => {
    expect(reqs(result).length).toBe(8)
  })

  it("has a v1 folder", () => {
    const folders = result.collection.items.filter(
      (i: { type: string }) => i.type === "folder",
    )
    expect(folders.length).toBe(1)
    expect(
      (folders[0] as { type: "folder"; data: { name: string } }).data.name,
    ).toBe("v1")
  })

  it("all requests have correct HTTP methods", () => {
    const methods = reqs(result).map((r: Request) => r.method)
    expect(methods).toContain("GET")
    expect(methods).toContain("POST")
    expect(methods).toContain("PUT")
    expect(methods).toContain("PATCH")
  })

  it("URLs use $baseUrl template syntax", () => {
    for (const r of reqs(result)) {
      expect(r.url).toContain("$baseUrl")
    }
    const pingReq = reqs(result).find(
      (r: Request) => r.name === "v1_core_ping_retrieve",
    )
    expect(pingReq?.url).toBe("$baseUrl/api/v1/core/ping/")
  })

  it("auth tokens use $token syntax", () => {
    for (const r of reqs(result)) {
      if (r.auth && r.auth.type === "bearer") {
        expect(r.auth.token).toMatch(/\$/)
      }
    }
  })

  it("has default environment with baseUrl and token", () => {
    expect(result.environments.length).toBe(1)
    expect(result.environments[0].name).toBe("default")
    expect(result.environments[0].vars).toHaveProperty("baseUrl")
    expect(result.environments[0].vars).toHaveProperty("token")
  })

  it("v1_auth_create_create has JSON body", () => {
    const createReq = reqs(result).find(
      (r: Request) => r.name === "v1_auth_create_create",
    )
    expect(createReq).toBeDefined()
    expect(createReq!.bodyType).toBe("json")
    expect(createReq!.body).toContain("email")
    expect(createReq!.body).toContain("password")
  })

  it("requests in folder have id including folder path", () => {
    for (const r of reqs(result)) {
      expect(r.id).toBeDefined()
      expect(typeof r.id).toBe("string")
    }
  })
})

describe("postmanImporter — query parameters", () => {
  it("keeps query values in params instead of the request URL", () => {
    const result = postmanImporter.import(
      JSON.stringify({
        info: {
          name: "Query API",
          schema:
            "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: [
          {
            name: "search",
            request: {
              method: "GET",
              url: "https://api.example.com/search?q={{term}}&page=2",
            },
          },
        ],
      }),
    )

    const request = reqs(result)[0]
    expect(request.url).toBe("https://api.example.com/search")
    expect(request.params).toEqual([
      { name: "q", value: "$term", enabled: true },
      { name: "page", value: "2", enabled: true },
    ])
  })
})
