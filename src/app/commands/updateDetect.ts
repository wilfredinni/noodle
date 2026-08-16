import { realpathSync } from "node:fs"

export function getPlatformString(platform: string, arch: string): string {
  const os =
    platform === "darwin" ? "macos" : platform === "linux" ? "linux" : null
  const cpu = arch === "arm64" ? "arm64" : arch === "x64" ? "x86_64" : null
  if (!os || !cpu) throw new Error(`Unsupported platform: ${platform}-${arch}`)
  return `${os}-${cpu}`
}

const HOMEBREW_PREFIXES = [
  "/opt/homebrew",
  "/usr/local",
  "/home/linuxbrew/.linuxbrew",
]

function getHomebrewPrefix(path: string): string | null {
  return (
    HOMEBREW_PREFIXES.find((prefix) =>
      path.startsWith(`${prefix}/Cellar/noodle/`),
    ) ?? null
  )
}

export function isBunRuntime(execPath: string): boolean {
  const name = execPath.split("/").pop() ?? ""
  return name === "bun" || name === "bunx" || name.startsWith("bun-")
}

export function isHomebrewInstall(execPath: string): boolean {
  if (isBunRuntime(execPath)) return false
  try {
    return getHomebrewPrefix(realpathSync(execPath)) !== null
  } catch {
    return getHomebrewPrefix(execPath) !== null
  }
}

export function getHomebrewExecutable(execPath: string): string {
  let path = execPath
  try {
    path = realpathSync(execPath)
  } catch {
    // Use the supplied path when it cannot be resolved (for example in tests).
  }

  const prefix = getHomebrewPrefix(path)
  if (!prefix) throw new Error("Unable to resolve Homebrew executable")
  return `${prefix}/bin/brew`
}
