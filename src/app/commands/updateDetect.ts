import { lstatSync, realpathSync } from "node:fs"

export function getPlatformString(platform: string, arch: string): string {
  const os =
    platform === "darwin" ? "macos" : platform === "linux" ? "linux" : null
  const cpu = arch === "arm64" ? "arm64" : arch === "x64" ? "x86_64" : null
  if (!os || !cpu) throw new Error(`Unsupported platform: ${platform}-${arch}`)
  return `${os}-${cpu}`
}

function isHomebrewPath(p: string): boolean {
  return (
    p.includes("/homebrew/") ||
    p.includes("/.linuxbrew/") ||
    p.includes("/usr/local/Cellar/") ||
    p.includes("/usr/local/Homebrew/") ||
    p.includes("/brew/bin/")
  )
}

const HOMEBREW_BIN_PREFIXES = [
  "/usr/local/bin/",
  "/opt/homebrew/bin/",
  "/home/linuxbrew/.linuxbrew/bin/",
]

export function isBunRuntime(execPath: string): boolean {
  const name = execPath.split("/").pop() ?? ""
  return name === "bun" || name === "bunx" || name.startsWith("bun-")
}

export function isHomebrewInstall(execPath: string): boolean {
  if (isBunRuntime(execPath)) return false
  if (isHomebrewPath(execPath)) return true
  try {
    if (isHomebrewPath(realpathSync(execPath))) return true
  } catch {
    try {
      if (
        HOMEBREW_BIN_PREFIXES.some((p) => execPath.startsWith(p)) &&
        lstatSync(execPath).isSymbolicLink()
      ) {
        return true
      }
    } catch {
      // stat failed too, file doesn't exist
    }
  }
  return false
}
