import { describe, it, expect } from "bun:test"
import {
  findRequestById,
  findFolderByPath,
  updateFolderByPath,
  flattenRequests,
  visibleNodes,
  deriveRequestParentFolder,
} from "../src/ui/tree"
import type { CollectionItem } from "../src/schema"

function req(id: string, name?: string): CollectionItem {
  return {
    type: "request",
    data: {
      id,
      name: name ?? id,
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: {},
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
    },
  }
}

function folder(
  path: string,
  children: CollectionItem[],
  name?: string,
): CollectionItem {
  return {
    type: "folder",
    data: { id: path.split("/").pop()!, name: name ?? path, path, children },
  }
}

const singleRequest = [req("get-user")]
const flatItems = [req("z"), req("a")]
const nestedItems: CollectionItem[] = [
  folder("auth", [req("auth/login")], "Auth"),
  req("root"),
  folder(
    "users",
    [req("users/list"), folder("users/admins", [req("users/admins/root")])],
    "Users",
  ),
]

describe("findRequestById", () => {
  it("finds request in flat list", () => {
    const result = findRequestById(singleRequest, "get-user")
    expect(result).not.toBeNull()
    expect(result!.id).toBe("get-user")
  })

  it("returns null for missing id", () => {
    expect(findRequestById(singleRequest, "nope")).toBeNull()
  })

  it("finds request inside folder", () => {
    const result = findRequestById(nestedItems, "auth/login")
    expect(result).not.toBeNull()
    expect(result!.id).toBe("auth/login")
  })

  it("finds request in deeply nested folder", () => {
    const result = findRequestById(nestedItems, "users/admins/root")
    expect(result).not.toBeNull()
    expect(result!.id).toBe("users/admins/root")
  })
})

describe("findFolderByPath", () => {
  it("finds folder in flat list", () => {
    const items: CollectionItem[] = [
      folder("auth", [req("auth/login")], "Auth"),
    ]
    const result = findFolderByPath(items, "auth")
    expect(result).not.toBeNull()
    expect(result!.path).toBe("auth")
    expect(result!.name).toBe("Auth")
  })

  it("returns null for missing path", () => {
    expect(findFolderByPath(nestedItems, "nope")).toBeNull()
  })

  it("finds nested folder", () => {
    const result = findFolderByPath(nestedItems, "users/admins")
    expect(result).not.toBeNull()
    expect(result!.path).toBe("users/admins")
  })

  it("returns null when path matches a request not a folder", () => {
    expect(findFolderByPath(nestedItems, "root")).toBeNull()
  })
})

describe("updateFolderByPath", () => {
  it("updates folder name in flat list", () => {
    const updated = updateFolderByPath(nestedItems, "auth", {
      id: "auth",
      name: "Renamed",
      path: "auth",
      children: [],
    })
    const folder = findFolderByPath(updated, "auth")
    expect(folder?.name).toBe("Renamed")
  })

  it("updates nested folder", () => {
    const updated = updateFolderByPath(nestedItems, "users/admins", {
      id: "admins",
      name: "Super Admins",
      path: "users/admins",
      children: [],
    })
    const folder = findFolderByPath(updated, "users/admins")
    expect(folder?.name).toBe("Super Admins")
  })

  it("preserves other folders unchanged", () => {
    const updated = updateFolderByPath(nestedItems, "auth", {
      id: "auth",
      name: "Renamed",
      path: "auth",
      children: [],
    })
    const users = findFolderByPath(updated, "users")
    expect(users?.name).toBe("Users")
  })

  it("returns same items when path not found", () => {
    const updated = updateFolderByPath(nestedItems, "nope", {
      id: "nope",
      name: "?",
      path: "nope",
      children: [],
    })
    expect(updated).toEqual(nestedItems)
  })
})

describe("flattenRequests", () => {
  it("returns empty for empty items", () => {
    expect(flattenRequests([])).toEqual([])
  })

  it("flattens single request", () => {
    const result = flattenRequests(singleRequest)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe("get-user")
  })

  it("flattens requests inside folders", () => {
    const result = flattenRequests(nestedItems)
    const ids = result.map((r) => r.id)
    expect(ids).toContain("auth/login")
    expect(ids).toContain("root")
    expect(ids).toContain("users/list")
    expect(ids).toContain("users/admins/root")
  })
})

describe("visibleNodes", () => {
  it("returns visible nodes for flat items", () => {
    const result = visibleNodes(flatItems, new Set())
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe("z")
    expect(result[1]!.id).toBe("a")
  })

  it("shows collapsed folder as single node", () => {
    const result = visibleNodes(nestedItems, new Set())
    const folderIds = result
      .filter((n) => n.type === "folder")
      .map((n) => n.id)
    expect(folderIds).toEqual(["auth", "users"])
    expect(result).toHaveLength(3) // auth, root, users
  })

  it("shows expanded folder children", () => {
    const result = visibleNodes(nestedItems, new Set(["auth"]))
    expect(result).toHaveLength(4) // auth(expanded), auth/login, root, users(collapsed)
    expect(result[1]!.type).toBe("request")
    expect(result[1]!.id).toBe("auth/login")
  })

  it("shows deeply expanded children", () => {
    const result = visibleNodes(
      nestedItems,
      new Set(["auth", "users", "users/admins"]),
    )
    const ids = result.map((n) => n.id)
    expect(ids).toEqual([
      "auth",
      "auth/login",
      "root",
      "users",
      "users/list",
      "users/admins",
      "users/admins/root",
    ])
  })

  it("marks expanded folders with expanded=true", () => {
    const result = visibleNodes(nestedItems, new Set(["auth"]))
    const authFolder = result.find((n) => n.id === "auth")
    expect(authFolder?.expanded).toBe(true)
    const usersFolder = result.find((n) => n.id === "users")
    expect(usersFolder?.expanded).toBe(false)
  })
})

describe("deriveRequestParentFolder", () => {
  it("returns focusedFolderPath when set", () => {
    expect(deriveRequestParentFolder("users", null)).toBe("users")
    expect(deriveRequestParentFolder("users", "auth/login")).toBe("users")
  })

  it("derives parent folder from selectedId when no focused folder", () => {
    expect(deriveRequestParentFolder(null, "users/list")).toBe("users")
    expect(deriveRequestParentFolder(null, "auth/login")).toBe("auth")
    expect(deriveRequestParentFolder(null, "users/admins/root")).toBe("users/admins")
  })

  it("returns null for root request and no focused folder", () => {
    expect(deriveRequestParentFolder(null, "get-user")).toBeNull()
    expect(deriveRequestParentFolder(null, null)).toBeNull()
  })
})
