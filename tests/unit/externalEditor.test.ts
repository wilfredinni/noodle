import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

  it.skipIf(process.platform !== "win32")(
    "launches a native Windows .cmd editor with spaces and Unicode and rejects unsafe batch arguments",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "noodle-win editor-"))
      try {
        const capture = join(dir, "capture.json")
        const script = join(dir, "capture.ts")
        await writeFile(
          script,
          `await Bun.write(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));`,
        )
        await writeFile(
          join(dir, "code.cmd"),
          `@echo off\r\n"${process.execPath}" "${script}" "%~1"\r\n`,
        )
        const editors = detectExternalEditors({
          platform: "win32",
          which: (command) => Bun.which(command, { PATH: dir }),
        })
        expect(editors.map((editor) => editor.id)).toEqual(["vscode"])
        const target = join(dir, "carpeta café notes")
        await launchExternalEditor(editors[0]!, target)
        expect(JSON.parse(await readFile(capture, "utf8"))).toEqual([target])
        await rm(capture)
        for (const character of [
          '"',
          "%",
          "&",
          "|",
          "<",
          ">",
          "^",
          "\r",
          "\n",
        ]) {
          let failure: unknown
          try {
            await launchExternalEditor(
              editors[0]!,
              `${target}${character}notes`,
            )
          } catch (error) {
            failure = error
          }
          expect(failure).toMatchObject({
            message: "Unable to open folder in Visual Studio Code",
            cause: { code: "ERR_INVALID_ARG_VALUE" },
          })
          expect(await Bun.file(capture).exists()).toBe(false)
        }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )
})
