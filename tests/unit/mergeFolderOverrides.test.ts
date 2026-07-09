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
    params: [],
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

  it("returns request unchanged when path has no folders", () => {
    const req = makeRequest()
    const col: Collection = { id: "c", name: "C", items: [] }
    const result = mergeFolderOverrides(req, col, "plain-req")
    expect(result).toBe(req)
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

  it("nested folders merge headers in parent->child order", () => {
    const child = makeFolder("auth/bearer", {
      headers: { "X-Child": { value: "cv", enabled: true } },
    })
    const parent = makeFolderData(
      "auth",
      { headers: { "X-Parent": { value: "pv", enabled: true } } },
      [{ type: "folder", data: child }],
    )
    const req = makeRequest()
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "auth/bearer/login")
    expect(result.headers["X-Parent"]?.value).toBe("pv")
    expect(result.headers["X-Child"]?.value).toBe("cv")
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

  it("none request auth means no auth — does NOT look up folder", () => {
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
    expect(result.auth).toEqual({ type: "none" })
  })

  it("undefined request auth means no auth — does NOT look up folder", () => {
    const folder = makeFolder("auth", {
      auth: { type: "bearer", token: "tok123" },
    })
    const req = makeRequest()
    req.auth = undefined
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "auth/login")
    expect(result.auth).toEqual({ type: "none" })
  })

  it("inherit request auth uses folder auth when available", () => {
    const folder = makeFolder("auth", {
      auth: { type: "bearer", token: "tok123" },
    })
    const req = makeRequest({ auth: { type: "inherit" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "auth/login")
    expect(result.auth).toEqual({ type: "bearer", token: "tok123" })
  })

  it("inherit falls back to none when no folder has auth", () => {
    const folder = makeFolder("empty", { headers: {} })
    const req = makeRequest({ auth: { type: "inherit" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: folder }],
    }
    const result = mergeFolderOverrides(req, col, "empty/login")
    expect(result.auth).toEqual({ type: "none" })
  })

  it("inherit falls back to none when no folders exist", () => {
    const req = makeRequest({ auth: { type: "inherit" } })
    const col: Collection = { id: "c", name: "C", items: [] }
    const result = mergeFolderOverrides(req, col, "foo")
    expect(result).toBe(req)
  })

  it("inherit walks child→parent, picks deepest non-none folder auth", () => {
    const child = makeFolder("api/v2", {
      auth: { type: "bearer", token: "child-tok" },
    })
    const parent = makeFolderData(
      "api",
      { auth: { type: "basic", user: "parent", pass: "pw" } },
      [{ type: "folder", data: child }],
    )
    const req = makeRequest({ auth: { type: "inherit" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "api/v2/endpoint")
    expect(result.auth).toEqual({ type: "bearer", token: "child-tok" })
  })

  it("inherit skips parent with none, picks child with bearer", () => {
    const child = makeFolder("api/v2", {
      auth: { type: "bearer", token: "tok" },
    })
    const parent = makeFolderData("api", { auth: { type: "none" } }, [
      { type: "folder", data: child },
    ])
    const req = makeRequest({ auth: { type: "inherit" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "api/v2/endpoint")
    expect(result.auth).toEqual({ type: "bearer", token: "tok" })
  })

  it("inherit picks parent auth when child is none", () => {
    const child = makeFolder("api/v2", {
      auth: { type: "none" },
    })
    const parent = makeFolderData(
      "api",
      { auth: { type: "basic", user: "admin", pass: "pw" } },
      [{ type: "folder", data: child }],
    )
    const req = makeRequest({ auth: { type: "inherit" } })
    const col: Collection = {
      id: "c",
      name: "C",
      items: [{ type: "folder", data: parent }],
    }
    const result = mergeFolderOverrides(req, col, "api/v2/endpoint")
    expect(result.auth).toEqual({ type: "basic", user: "admin", pass: "pw" })
  })
})
