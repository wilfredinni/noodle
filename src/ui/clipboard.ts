import type { CliRenderer } from "@opentui/core"

const CLIPBOARD_CMDS: Array<{ cmd: string[]; platform: string }> = [
  { cmd: ["pbcopy"], platform: "darwin" },
  { cmd: ["xclip", "-selection", "clipboard"], platform: "linux" },
  { cmd: ["wl-copy"], platform: "linux" },
  { cmd: ["clip.exe"], platform: "win32" },
]

export type ClipboardSpawn = (
  command: string[],
  options: { stdin: Uint8Array },
) => { exitCode: number }

export function copyToClipboard(
  text: string,
  renderer: CliRenderer,
  spawn: ClipboardSpawn = Bun.spawnSync,
  platform = process.platform,
): boolean {
  const stdin =
    platform === "win32"
      ? Buffer.from(text, "utf16le")
      : new TextEncoder().encode(text)

  for (const { cmd, platform: commandPlatform } of CLIPBOARD_CMDS) {
    if (commandPlatform !== platform) continue
    try {
      const result = spawn(cmd, { stdin })
      if (result.exitCode === 0) return true
    } catch {
      continue
    }
  }

  return renderer.copyToClipboardOSC52(text)
}
