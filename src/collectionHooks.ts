import type { CollectionItem, CollectionSettings, Request } from "./schema"
import { validateId } from "./requestId"

export type RunStage = "setup" | "main" | "teardown"
export type CollectionHooks = { setup?: string; teardown?: string }

export function parseCollectionHooks(value: unknown): CollectionHooks {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error("settings.yml: hooks must be a mapping")
  const hooks: CollectionHooks = {}
  for (const [key, id] of Object.entries(value)) {
    if (key !== "setup" && key !== "teardown")
      throw new Error("settings.yml: unknown hook field")
    if (typeof id !== "string")
      throw new Error(`settings.yml: hooks.${key} must be a request ID`)
    try {
      validateId(id)
    } catch {
      throw new Error(`settings.yml: hooks.${key} must be a valid request ID`)
    }
    hooks[key] = id
  }
  if (hooks.setup !== undefined && hooks.setup === hooks.teardown)
    throw new Error(
      "settings.yml: setup and teardown must reference different requests",
    )
  return hooks
}

export function resolveCollectionHooks(
  items: CollectionItem[],
  hooks?: CollectionSettings["hooks"],
): { setup?: Request; teardown?: Request } {
  const requests = new Map<string, Request>()
  const visit = (items: CollectionItem[]) => {
    for (const item of items) {
      if (item.type === "request") requests.set(item.data.id, item.data)
      else visit(item.data.children)
    }
  }
  visit(items)
  const resolved: { setup?: Request; teardown?: Request } = {}
  for (const [stage, id] of Object.entries(parseCollectionHooks(hooks ?? {}))) {
    const request = requests.get(id)
    if (!request)
      throw new Error(
        `settings.yml: hooks.${stage} references a missing request`,
      )
    resolved[stage as "setup" | "teardown"] = request
  }
  return resolved
}
