import type { CollectionItem, Request } from "../schema"

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
