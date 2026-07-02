import { describe, it, expect } from "bun:test"
import {
  convertTpl,
  slugify,
  urlTemplateToVar,
  joinUrl,
  paramDefault,
  makeIdRaw,
} from "../../src/converters/openapi"

describe("convertTpl", () => {
  it("converts {{var}} to $var", () => {
    expect(convertTpl("{{name}}")).toBe("$name")
  })

  it("converts multiple variables", () => {
    expect(convertTpl("{{a}}-{{b}}")).toBe("$a-$b")
  })

  it("passes through strings without templates", () => {
    expect(convertTpl("hello world")).toBe("hello world")
  })

  it("handles empty string", () => {
    expect(convertTpl("")).toBe("")
  })
})

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("My Cool API")).toBe("my-cool-api")
  })

  it("strips non-alphanumeric", () => {
    expect(slugify("Hello!!! World?")).toBe("hello-world")
  })

  it("collapses multiple hyphens", () => {
    expect(slugify("a---b")).toBe("a-b")
  })

  it("trims leading/trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello")
  })

  it("returns empty string for all-punctuation", () => {
    expect(slugify("!!!")).toBe("")
  })

  it("handles empty string", () => {
    expect(slugify("")).toBe("")
  })
})

describe("urlTemplateToVar", () => {
  it("converts {id} to $id", () => {
    expect(urlTemplateToVar("/users/{id}")).toBe("/users/$id")
  })

  it("converts multiple template vars", () => {
    expect(urlTemplateToVar("/{a}/{b}")).toBe("/$a/$b")
  })

  it("passes through without templates", () => {
    expect(urlTemplateToVar("/users")).toBe("/users")
  })

  it("handles empty string", () => {
    expect(urlTemplateToVar("")).toBe("")
  })
})

describe("joinUrl", () => {
  it("joins base and path", () => {
    expect(joinUrl("https://api.example.com/v1", "/users")).toBe(
      "https://api.example.com/v1/users",
    )
  })

  it("strips trailing slash from base", () => {
    expect(joinUrl("https://api.example.com/", "/users")).toBe(
      "https://api.example.com/users",
    )
  })

  it("adds leading slash to path when missing", () => {
    expect(joinUrl("https://api.example.com", "users")).toBe(
      "https://api.example.com/users",
    )
  })

  it("handles empty base", () => {
    expect(joinUrl("", "/users")).toBe("/users")
  })

  it("handles base with only slash", () => {
    expect(joinUrl("/", "/users")).toBe("/users")
  })
})

describe("paramDefault", () => {
  it("returns example as string", () => {
    expect(paramDefault({ name: "q", in: "query", example: "hello" })).toBe(
      "hello",
    )
  })

  it("returns schema.default when example missing", () => {
    expect(
      paramDefault({
        name: "limit",
        in: "query",
        schema: { default: 10 },
      }),
    ).toBe("10")
  })

  it("converts {{var}} in example", () => {
    expect(
      paramDefault({ name: "filter", in: "query", example: "{{filter}}" }),
    ).toBe("$filter")
  })

  it("returns undefined when no example or default", () => {
    expect(paramDefault({ name: "q", in: "query" })).toBeUndefined()
  })
})

describe("makeIdRaw", () => {
  it("derives id from method and path", () => {
    expect(makeIdRaw("get", "/users/{id}")).toBe("get-users-id")
  })

  it("handles path without variables", () => {
    expect(makeIdRaw("post", "/users")).toBe("post-users")
  })

  it("strips braces from path segments", () => {
    expect(makeIdRaw("get", "/pets/{petId}/items/{itemId}")).toBe(
      "get-pets-petid-items-itemid",
    )
  })
})
