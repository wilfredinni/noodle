import { describe, it, expect } from "bun:test"
import { mergeFolderOverrides } from "../../src/requests/mergeFolderOverrides"
import type { Collection, Folder, Request } from "../../src/schema"

function makeRequest(overrides?: Partial<Request>): Request {
  return {
    id: "test",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: {},
    auth: { type: "none" },
    bodyType: "none",
    body: "",
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    ...overrides,
  }
}

function makeFolderData(
  path: string,
  overrides?: Folder["overrides"],
  children?: Folder["children"],
): Folder {
  return {
    id: path.split("/").pop()!,
    name: path.split("/").pop()!,
    path,
    children: children ?? [],
    overrides,
  }
}

function makeFolder(path: string, overrides?: Folder["overrides"]): Folder {
  return makeFolderData(path, overrides)
}

describe("mergeFolderOverrides", () => {
  it("returns unchanged request when no folder exists", () => {
    const req = makeRequest()
    const col: Collection = { id: "c", name: "C", items: [] }
    const result = mergeFolderOverrides(req, col, "test")
    expect(result.headers).toEqual(req.headers)
  })

  it("merges folder headers into request", () => {
    const folder = makeFolder("auth", {
      headers: { "X-Folder": { value: "fv", enabled: true } },
    })
    const req = makeRequest({
      headers: { "X-Req": { value: "rv", enabled: true } },
    })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "auth/login")
    expect(result.headers["X-Folder"]).toEqual({ value: "fv", enabled: true })
    expect(result.headers["X-Req"]).toEqual({ value: "rv", enabled: true })
  })

  it("request headers override folder headers on conflict", () => {
    const folder = makeFolder("auth", {
      headers: { "X-Common": { value: "folder", enabled: true } },
    })
    const req = makeRequest({
      headers: { "X-Common": { value: "request", enabled: true } },
    })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "auth/login")
    expect(result.headers["X-Common"]?.value).toBe("request")
  })

  it("merges folder params", () => {
    const folder = makeFolder("api", {
      params: { limit: { value: "50", enabled: true } },
    })
    const req = makeRequest()
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "api/users")
    expect(result.params["limit"]).toEqual({ value: "50", enabled: true })
  })

  it("applies folder auth when request auth is none", () => {
    const folder = makeFolder("auth", {
      auth: { type: "bearer", token: "tok123" },
    })
    const req = makeRequest({ auth: { type: "none" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "auth/login")
    expect(result.auth).toEqual({ type: "bearer", token: "tok123" })
  })

  it("request auth overrides folder auth", () => {
    const folder = makeFolder("auth", {
      auth: { type: "bearer", token: "folder-tok" },
    })
    const req = makeRequest({
      auth: { type: "basic", user: "u", pass: "p" },
    })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "auth/login")
    expect(result.auth).toEqual({ type: "basic", user: "u", pass: "p" })
  })

  it("nested folders merge in path order (parent->child)", () => {
    const child = makeFolder("auth/bearer", {
      headers: { "X-Child": { value: "cv", enabled: true } },
      auth: { type: "bearer", token: "child-tok" },
    })
    const parent = makeFolderData(
      "auth",
      { headers: { "X-Parent": { value: "pv", enabled: true } } },
      [{ type: "folder", data: child }],
    )
    const req = makeRequest({ auth: { type: "none" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "auth/bearer/login")
    expect(result.headers["X-Parent"]?.value).toBe("pv")
    expect(result.headers["X-Child"]?.value).toBe("cv")
    expect(result.auth).toEqual({ type: "bearer", token: "child-tok" })
  })

  it("returns request unchanged when path has no folders", () => {
    const req = makeRequest()
    const col: Collection = {
      id: "c",
      name: "C",
      items: [],
    }
    const result = mergeFolderOverrides(req, col, "plain-req")
    expect(result).toBe(req)
  })

  it("child folder headers don't override request on conflict", () => {
    const child = makeFolder("api/v2", {
      headers: { Accept: { value: "text/plain", enabled: true } },
    })
    const parent = makeFolderData(
      "api",
      { headers: { Accept: { value: "text/csv", enabled: true } } },
      [{ type: "folder", data: child }],
    )
    const req = makeRequest({
      headers: {
        Accept: { value: "application/json", enabled: true },
      },
    })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "api/v2/endpoint")
    expect(result.headers["Accept"]?.value).toBe("application/json")
  })

  it("innermost non-none folder auth wins", () => {
    const child = makeFolder("api/v2", {
      auth: { type: "bearer", token: "child-tok" },
    })
    const parent = makeFolderData(
      "api",
      { auth: { type: "basic", user: "parent", pass: "pw" } },
      [{ type: "folder", data: child }],
    )
    const req = makeRequest({ auth: { type: "none" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "api/v2/endpoint")
    expect(result.auth).toEqual({ type: "bearer", token: "child-tok" })
  })
})
