import type { CollectionItem, Folder, Request } from "../schema"

export function updateFolderByPath(
  items: CollectionItem[],
  path: string,
  folder: Folder,
): CollectionItem[] {
  return items.map((item) => {
    if (item.type === "folder") {
      if (item.data.path === path) {
        return { type: "folder", data: { ...folder } }
      }
      return {
        type: "folder",
        data: {
          ...item.data,
          children: updateFolderByPath(item.data.children, path, folder),
        },
      }
    }
    return item
  })
}

export function findFolderByPath(
  items: CollectionItem[],
  path: string,
): Folder | null {
  for (const item of items) {
    if (item.type === "folder") {
      if (item.data.path === path) return item.data
      const found = findFolderByPath(item.data.children, path)
      if (found) return found
    }
  }
  return null
}

export function findRequestById(
  items: CollectionItem[],
  id: string,
): Request | null {
  for (const item of items) {
    if (item.type === "request" && item.data.id === id) return item.data
    if (item.type === "folder") {
      const found = findRequestById(item.data.children, id)
      if (found) return found
    }
  }
  return null
}

export function flattenRequests(items: CollectionItem[]): Request[] {
  const out: Request[] = []
  for (const item of items) {
    if (item.type === "request") {
      out.push(item.data)
    } else {
      out.push(...flattenRequests(item.data.children))
    }
  }
  return out
}

export interface VisibleNode {
  type: "request" | "folder"
  id: string
  name: string
  depth: number
  expanded: boolean
  hasChildren: boolean
  method?: string
}

export function visibleNodes(
  items: CollectionItem[],
  expanded: Set<string>,
  depth = 0,
): VisibleNode[] {
  const out: VisibleNode[] = []
  for (const item of items) {
    if (item.type === "request") {
      out.push({
        type: "request",
        id: item.data.id,
        name: item.data.name,
        depth,
        expanded: false,
        hasChildren: false,
        method: item.data.method,
      })
    } else {
      const f = item.data
      const isExpanded = expanded.has(f.path)
      out.push({
        type: "folder",
        id: f.path,
        name: f.name,
        depth,
        expanded: isExpanded,
        hasChildren: f.children.length > 0,
      })
      if (isExpanded) {
        out.push(...visibleNodes(f.children, expanded, depth + 1))
      }
    }
  }
  return out
}

export function getRequestIds(items: CollectionItem[]): string[] {
  return flattenRequests(items).map((r) => r.id)
}

export function getFolderPaths(
  items: CollectionItem[],
): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = [{ path: "", name: "(root)" }]
  for (const item of items) {
    if (item.type === "folder") {
      out.push({ path: item.data.path, name: item.data.name })
      collectFolderPaths(item.data.children, out)
    }
  }
  return out
}

function collectFolderPaths(
  items: CollectionItem[],
  out: { path: string; name: string }[],
): void {
  for (const item of items) {
    if (item.type === "folder") {
      out.push({ path: item.data.path, name: item.data.name })
      collectFolderPaths(item.data.children, out)
    }
  }
}

export function deriveRequestParentFolder(
  focusedFolderPath: string | null,
  selectedId: string | null,
): string | null {
  if (focusedFolderPath) return focusedFolderPath
  if (selectedId && selectedId.includes("/"))
    return selectedId.slice(0, selectedId.lastIndexOf("/"))
  return null
}
