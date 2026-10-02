import { homedir } from "node:os"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

export function getNoodleConfigDir(home = homedir()): string {
  return join(home, ".config", "noodle")
}

export function validateFilenameSegment(
  name: string,
  platform = process.platform,
): void {
  if (
    platform === "win32" &&
    // Windows forbids all C0 controls in filesystem segments.
    // oxlint-disable-next-line no-control-regex
    (/[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
      /[. ]$/.test(name) ||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$) *(?:\.|$)/i.test(
        name,
      ))
  ) {
    throw new Error(`invalid Windows filename ${JSON.stringify(name)}`)
  }
}

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
