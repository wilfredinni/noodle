import { rm } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"

export async function removeTestDirectory(directory: string, remove = rm) {
  for (let attempt = 0; ; attempt++) {
    try {
      await remove(directory, { recursive: true, force: true })
      return
    } catch (error) {
      if (
        attempt === 5 ||
        !["EBUSY", "EMFILE", "ENFILE", "ENOTEMPTY", "EPERM"].includes(
          (error as NodeJS.ErrnoException | null)?.code ?? "",
        )
      )
        throw error
      // Bun 1.4.3 parses rm retry options but does not apply them.
      await setTimeout(100 * (attempt + 1))
    }
  }
}
