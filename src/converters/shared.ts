import * as yaml from "../yaml"
import type { Method } from "../schema"

export const METHOD_UPPER: Record<string, Method> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

export function setOwn<T>(record: Record<string, T>, key: string, value: T) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

export function parseJsonOrYaml(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return yaml.load(content)
  }
}
