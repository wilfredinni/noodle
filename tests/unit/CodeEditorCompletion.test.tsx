import { describe, expect, it } from "bun:test"
import { act } from "react"
import { useState } from "react"
import { extend } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { MouseButtons } from "@opentui/core/testing"
import { createTestKeymap } from "@opentui/keymap/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import { CodeEditorCompletion } from "../../src/ui/editor/CodeEditorCompletion"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import { ThemeProvider } from "../../src/ui/theme"
import type { Environment } from "../../src/schema"
import { opencodeTheme } from "../../src/ui/theme-data"

extend({ "code-editor": CodeEditorRenderable })

function Harness({ env }: { env: Environment }) {
  const [editor, setEditor] = useState<CodeEditorRenderable | null>(null)
  return (
    <box width={60} height={10}>
      <code-editor
        id="test-editor"
        ref={(next) => {
          setEditor(next)
          next?.focus()
          if (next) next.cursorOffset = next.plainText.length
        }}
        filetype="json"
        theme={opencodeTheme}
        initialValue="$ho"
        backgroundColor="transparent"
        focusedBackgroundColor="transparent"
        textColor="#fff"
        cursorColor="#fff"
      />
      <CodeEditorCompletion editor={editor} env={env} isEditing value="$ho" />
    </box>
  )
}

describe("CodeEditorCompletion", () => {
  it("shows and accepts active environment variables", async () => {
    const { keymap, host, cleanup } = createTestKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider
        keymap={keymap as unknown as KeymapProviderProps["keymap"]}
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <VariableCompletionInterceptor />
          <Harness
            env={{ name: "test", vars: { host: "localhost", token: "secret" } }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )

    await renderOnce()
    await act(async () => {
      host.press("tab")
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("$host")
    cleanup()
  })

  it("accepts a suggestion with the mouse", async () => {
    const { renderer, renderOnce, captureCharFrame, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            env={{ name: "test", vars: { host: "localhost", token: "secret" } }}
          />
        </ThemeProvider>,
        { width: 60, height: 10 },
      )

    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("$host"))
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("$host"), y, MouseButtons.LEFT)
    })
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "test-editor",
    ) as CodeEditorRenderable
    expect(editor.plainText).toBe("$host")
  })
})
