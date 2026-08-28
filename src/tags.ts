import type { CollectionItem } from "./schema"

export function isValidTag(value: string): boolean {
  return value !== "" && value.trim() === value
}

export function effectiveRequestTags(
  items: CollectionItem[],
  inherited = new Set<string>(),
  result = new Map<string, Set<string>>(),
): Map<string, Set<string>> {
  for (const item of items) {
    if (item.type === "request") {
      result.set(
        item.data.id,
        new Set([...inherited, ...(item.data.tags ?? [])]),
      )
    } else {
      effectiveRequestTags(
        item.data.children,
        new Set([...inherited, ...(item.data.tags ?? [])]),
        result,
      )
    }
  }
  return result
}
