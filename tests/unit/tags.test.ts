import { describe, expect, it } from "bun:test"
import { effectiveRequestTags, isValidTag } from "../../src/tags"
import type { CollectionItem } from "../../src/schema"

describe("tags", () => {
  it("shares validation and request-plus-ancestor inheritance", () => {
    expect(isValidTag("smoke")).toBe(true)
    expect(isValidTag(" smoke")).toBe(false)
    expect(isValidTag("")).toBe(false)

    const items: CollectionItem[] = [
      {
        type: "folder",
        data: {
          id: "api",
          name: "API",
          path: "api",
          tags: ["smoke"],
          children: [
            {
              type: "folder",
              data: {
                id: "v1",
                name: "v1",
                path: "api/v1",
                tags: ["v1"],
                children: [
                  {
                    type: "request",
                    data: {
                      id: "api/v1/get",
                      name: "Get",
                      method: "GET",
                      url: "https://example.com",
                      headers: {},
                      params: [],
                      timeout: 0,
                      tags: ["critical"],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]
    expect([...effectiveRequestTags(items).get("api/v1/get")!]).toEqual([
      "smoke",
      "v1",
      "critical",
    ])
  })
})
