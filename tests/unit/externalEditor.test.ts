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
      exists: (path) => path === join("/Applications", "Zed.app"),
    })

    expect(editors).toEqual([
      {
        id: "zed",
        label: "Zed",
        command: ["open", "-a", join("/Applications", "Zed.app")],
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

  it("quotes only Windows batch editor commands and keeps ordinary launchers direct", async () => {
    const target = "C:\\Users\\test\\carpeta café! notes\\"
    for (const executable of ["code.cmd", "code.CMD", "code.bat. "]) {
      const editor: ExternalEditor = {
        id: "vscode",
        label: "Visual Studio Code",
        command: [`C:\\Program Files\\Editor\\${executable}`, "--reuse-window"],
      }
      await launchExternalEditor(
        editor,
        target,
        (command, options) => {
          expect(command.slice(1)).toEqual([
            "/d",
            "/v:off",
            "/s",
            "/c",
            `""${editor.command[0]}" "--reuse-window" "${target}\\""`,
          ])
          expect(options.windowsVerbatimArguments).toBe(true)
          return { exited: Promise.resolve(0) }
        },
        "win32",
      )
    }
    for (const [platform, executable] of [
      ["win32", "code.exe"],
      ["linux", "code.cmd"],
    ] as const) {
      const editor: ExternalEditor = {
        id: "vscode",
        label: "Visual Studio Code",
        command: [executable],
      }
      await launchExternalEditor(
        editor,
        target,
        (command, options) => {
          expect(command).toEqual([executable, target])
          expect(options.windowsVerbatimArguments).toBeUndefined()
          return { exited: Promise.resolve(0) }
        },
        platform,
      )
    }
  })

  it("rejects unsafe Windows batch command names and arguments before spawning", () => {
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
      "\0",
    ]) {
      for (const command of [
        [`C:\\Editor${character}\\code.cmd`],
        ["C:\\Editor\\code.cmd", `argument${character}`],
      ]) {
        const editor: ExternalEditor = {
          id: "vscode",
          label: "Visual Studio Code",
          command,
        }
        let spawned = false
        let failure: unknown
        try {
          launchExternalEditor(
            editor,
            "C:\\folder",
            () => {
              spawned = true
              return { exited: Promise.resolve(0) }
            },
            "win32",
          )
        } catch (error) {
          failure = error
        }
        expect(spawned).toBe(false)
        expect(failure).toMatchObject({
          message: "Unable to open folder in Visual Studio Code",
          cause: { code: "ERR_INVALID_ARG_VALUE" },
        })
      }
    }
  })

  it.skipIf(process.platform !== "win32")(
    "launches a native Windows .cmd editor with spaces and Unicode and rejects unsafe batch arguments",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "noodle-win editor café-"))
      try {
        const capture = join(dir, "capture.json")
        const script = join(dir, "capture.ts")
        await writeFile(
          script,
          `await Bun.write(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));`,
        )
        await writeFile(
          join(dir, "code.CMD"),
          `@echo off\r\n"${process.execPath}" "%~dp0capture.ts" %*\r\n`,
        )
        const editors = detectExternalEditors({
          platform: "win32",
          which: (command) => Bun.which(command, { PATH: dir }),
        })
        expect(editors.map((editor) => editor.id)).toEqual(["vscode"])
        const editor = {
          ...editors[0]!,
          command: [...editors[0]!.command, "--reuse-window"],
        }
        const target = join(dir, "carpeta café! notes")
        const launch: NonNullable<
          Parameters<typeof launchExternalEditor>[2]
        > = (command, options) => {
          const child = Bun.spawn(command, {
            ...options,
            stdout: "pipe",
            stderr: "pipe",
          })
          const output = Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ])
          return {
            exited: child.exited.then(async (exitCode) => {
              const [stdout, stderr] = await output
              if (exitCode !== 0) {
                throw new Error(
                  `Windows editor launcher exited ${exitCode}: ${stdout}${stderr}`,
                )
              }
              return exitCode
            }),
          }
        }
        for (const selected of [target, `${target}\\`, `${target}\\\\`]) {
          await launchExternalEditor(editor, selected, launch)
          expect(JSON.parse(await readFile(capture, "utf8"))).toEqual([
            "--reuse-window",
            selected,
          ])
          await rm(capture)
        }
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
            await launchExternalEditor(editor, `${target}${character}notes`)
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
