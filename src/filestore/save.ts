import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { lang } from "../lang"
import type { Request } from "../schema"

export async function saveRequest(dir: string, req: Request): Promise<void> {
  const id = (req as { id?: string }).id
  if (!id) {
    throw new Error("filestore.saveRequest: missing or invalid id")
  }
  if (id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw new Error(
      'filestore.saveRequest: id must not contain path separators or ".."',
    )
  }

  try {
    await mkdir(dir, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveRequest: ${msg}`, { cause: e })
  }

  const yaml = lang.serializeRequest(req)

  try {
    await writeFile(join(dir, `${id}.yml`), yaml, "utf8")
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`filestore.saveRequest: ${msg}`, { cause: e })
  }
}
