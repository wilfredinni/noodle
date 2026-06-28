import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { listEnvironments } from "./list"

export async function listEnvironmentsWithColors(
  dir: string,
): Promise<{ name: string; color?: string }[]> {
  const names = await listEnvironments(dir)
  const result: { name: string; color?: string }[] = []
  for (const name of names) {
    let color: string | undefined
    try {
      const content = await readFile(join(dir, `${name}.env`), "utf-8")
      const firstLine = content.split("\n")[0] ?? ""
      if (firstLine.startsWith("_color=")) {
        const value = firstLine.slice("_color=".length).trim()
        if (value) color = value
      }
    } catch {
      // ignore read errors
    }
    result.push({ name, color })
  }
  return result
}
