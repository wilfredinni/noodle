import { describe, expect, it } from "bun:test"
import {
  detectExternalEditors,
  launchExternalEditor,
  resolveExternalEditor,
  type ExternalEditor,
} from "../../src/externalEditor"

describe("external editors", () => {
  it("detects launchers in priority order", () => {
    const editors = detectExternalEditors({
      platform: "linux",
      which: (command) =>
        command === "zed" || command === "code" ? `/bin/${command}` : null,
    })

    expect(editors.map((editor) => editor.id)).toEqual(["zed", "vscode"])
    expect(editors[1]?.command).toEqual(["/bin/code"])
  })

  it("detects macOS application bundles without CLI launchers", () => {
    const editors = detectExternalEditors({
      platform: "darwin",
      homeDir: "/Users/test",
      which: () => null,
      exists: (path) => path === "/Applications/Zed.app",
    })

    expect(editors).toEqual([
      {
        id: "zed",
        label: "Zed",
        command: ["open", "-a", "/Applications/Zed.app"],
      },
    ])
  })

  it("falls back to the first installed editor", () => {
    const installed = detectExternalEditors({
      platform: "linux",
      which: (command) => (command === "code" ? "/bin/code" : null),
    })

    expect(resolveExternalEditor("zed", installed)?.id).toBe("vscode")
  })

  it("launches a folder as one argument and reports failures", async () => {
    const editor: ExternalEditor = {
      id: "zed",
      label: "Zed",
      command: ["/bin/zed"],
    }
    let command: string[] = []
    await launchExternalEditor(editor, "/tmp/folder with spaces", (args) => {
      command = args
      return { exited: Promise.resolve(0) }
    })
    expect(command).toEqual(["/bin/zed", "/tmp/folder with spaces"])

    expect(
      launchExternalEditor(editor, "/tmp/folder", () => ({
        exited: Promise.resolve(1),
      })),
    ).rejects.toThrow("Unable to open folder in Zed")
    expect(() =>
      launchExternalEditor(editor, "/tmp/folder", () => {
        throw new Error("spawn failed")
      }),
    ).toThrow("Unable to open folder in Zed")
  })
})
