import type { CliRenderer } from "@opentui/core"

const CLIPBOARD_CMDS: Array<{ cmd: string[]; platform: string }> = [
  { cmd: ["pbcopy"], platform: "darwin" },
  { cmd: ["xclip", "-selection", "clipboard"], platform: "linux" },
  { cmd: ["wl-copy"], platform: "linux" },
  { cmd: ["clip.exe"], platform: "win32" },
]

export function copyToClipboard(text: string, renderer: CliRenderer): boolean {
  const stdin = new TextEncoder().encode(text)

  for (const { cmd } of CLIPBOARD_CMDS) {
    try {
      const result = Bun.spawnSync(cmd, { stdin })
      if (result.exitCode === 0) return true
    } catch {
      continue
    }
  }

  return renderer.copyToClipboardOSC52(text)
}
