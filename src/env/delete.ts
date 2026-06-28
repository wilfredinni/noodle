import { unlink } from "node:fs/promises"
import { join } from "node:path"

export async function deleteEnvironment(
  dir: string,
  name: string,
): Promise<void> {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("env.delete: invalid environment name")
  }

  const filePath = join(dir, `${name}.env`)
  try {
    await unlink(filePath)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`env.delete: environment not found: ${name}`, {
        cause: e,
      })
    }
    throw new Error(`env.delete: ${msg}`, { cause: e })
  }
}
