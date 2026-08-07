import { homedir } from "node:os"
import { resolve } from "node:path"

export function expandUserPath(value: string, root = homedir()): string {
  if (value === "@") return root
  if (!value.startsWith("@/")) return value
  return resolve(root, value.slice(2))
}
