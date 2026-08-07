import { homedir } from "node:os"
import { isAbsolute, relative, resolve, sep } from "node:path"

export function expandUserPath(value: string, root = homedir()): string {
  if (value === "@") return root
  if (!value.startsWith("@/")) return value
  return resolve(root, value.slice(2))
}

export function collapseUserPath(value: string, root = homedir()): string {
  const path = relative(resolve(root), resolve(value))
  if (path === "") return "@/"
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    return value
  }
  return `@/${path.split(sep).join("/")}`
}
