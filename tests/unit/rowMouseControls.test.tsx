import { describe, expect, it } from "bun:test"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { createTestRender } from "../testRender"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { initialEditState } from "../../src/ui/editMode"
import { KeyValueSection } from "../../src/ui/KeyValueSection"
import { FormEditor } from "../../src/ui/FormEditor"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

describe("request row mouse controls", () => {
  it("activates and toggles key/value rows independently", async () => {
    const activations: Array<
      [number, boolean, "key" | "value" | "persist" | undefined]
    > = []
    const toggles: number[] = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <KeyValueSection
            kind="headers"
            entries={[
              {
                key: "Accept",
                value: { value: "application/json", enabled: true },
              },
            ]}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            theme={THEMES[0]!}
            onActivateRow={(row, addingRow, subfield) =>
              activations.push([row, addingRow, subfield])
            }
            onToggleRow={(row) => toggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(8, 0, MouseButtons.LEFT)
    await mockMouse.click(60, 0, MouseButtons.LEFT)
    await mockMouse.click(1, 0, MouseButtons.LEFT)

    expect(activations).toEqual([
      [0, false, "key"],
      [0, false, "value"],
    ])
    expect(toggles).toEqual([0])
  })

  it("activates and toggles capture rows independently", async () => {
    const { keymap, cleanup } = setupKeymap()
    const activations: Array<
      [number, boolean, "key" | "value" | "persist" | undefined]
    > = []
    const toggles: number[] = []
    const { renderOnce, captureCharFrame, mockMouse, mockInput } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box width={80} height={4}>
              <KeyValueSection
                kind="captures"
                entries={[
                  {
                    key: "token",
                    value: { value: "body.token", enabled: true },
                  },
                ]}
                editState={{
                  mode: "browsing",
                  cursor: { field: "captures", row: 0, addingRow: false },
                  editingRow: -1,
                }}
                editKey=""
                editValue=""
                setEditKey={() => {}}
                setEditValue={() => {}}
                theme={THEMES[0]!}
                onActivateRow={(row, addingRow, subfield) =>
                  activations.push([row, addingRow, subfield])
                }
                onToggleRow={(row) => toggles.push(row)}
              />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 4 },
      )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("token")
    expect(frame).toContain("body.token")
    expect(frame).toContain("Variable...")
    expect(frame).toContain("Response expression...")
    expect(frame).toContain("Run only")
    expect(frame).toContain("[x]")
    expect(frame).not.toContain("Extract response values")
    expect(frame).not.toContain("←")

    await mockMouse.click(1, 0, MouseButtons.LEFT)
    await mockMouse.click(8, 0, MouseButtons.LEFT)
    await mockMouse.click(60, 0, MouseButtons.LEFT)
    await mockMouse.click(8, 1, MouseButtons.LEFT)
    await mockMouse.click(60, 1, MouseButtons.LEFT)
    await act(async () => {
      await mockMouse.click(72, 0, MouseButtons.LEFT)
      mockInput.pressEscape()
    })

    expect(activations).toEqual([
      [0, false, "key"],
      [0, false, "value"],
      [-1, true, "key"],
      [-1, true, "value"],
      [0, false, "persist"],
    ])
    expect(toggles).toEqual([0])
    cleanup()
  })

  it("shows capture validation under the active row", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={44} height={4}>
            <KeyValueSection
              kind="captures"
              entries={[
                {
                  key: "token",
                  value: { value: "body.token", enabled: true },
                },
              ]}
              editState={{
                mode: "editing",
                cursor: {
                  field: "captures",
                  row: 0,
                  addingRow: false,
                  subfield: "key",
                },
                editingRow: 0,
              }}
              editKey="bad-name"
              editValue="body.token"
              editError="Invalid variable name"
              setEditKey={() => {}}
              setEditValue={() => {}}
              theme={THEMES[0]!}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 44, height: 4 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Invalid variable name")
    expect(frame).toContain("Run only")
    expect(frame.split("\n").every((line) => line.length <= 44)).toBe(true)
    cleanup()
  })

  it("changes capture persistence with the focused Select", async () => {
    const { keymap, host, cleanup: cleanupHost } = createTestKeymap()
    const cleanupEnabled = registerEnabledFields(keymap)
    const cleanupKeys = registerDefaultKeys(keymap)
    let selected = "transient"
    function Harness() {
      const [persistence, setPersistence] = useState<
        "transient" | "secret" | "environment"
      >("transient")
      selected = persistence
      return (
        <KeyValueSection
          kind="captures"
          entries={[
            {
              key: "token",
              value: { value: "body.token", enabled: true },
            },
          ]}
          editState={{
            mode: "editing",
            cursor: {
              field: "captures",
              row: 0,
              addingRow: false,
              subfield: "persist",
            },
            editingRow: 0,
          }}
          editKey="token"
          editValue="body.token"
          editCapturePersistence={persistence}
          setEditKey={() => {}}
          setEditValue={() => {}}
          setEditCapturePersistence={setPersistence}
          theme={THEMES[0]!}
        />
      )
    }
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={60} height={5}>
            <Harness />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 5 },
    )
    await render.renderOnce()
    await act(async () => host.press("return"))
    await render.renderOnce()
    const openFrame = render.captureCharFrame()
    expect(openFrame).toContain("Environment")
    expect(
      openFrame.split("\n").some((line) => line.trimEnd().endsWith("│")),
    ).toBe(true)
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(selected).toBe("secret")
    cleanupEnabled()
    cleanupKeys()
    cleanupHost()
  })

  it("mutes disabled capture rows", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={3}>
            <KeyValueSection
              kind="captures"
              entries={[
                {
                  key: "disabled_token",
                  value: {
                    value: "body.token",
                    enabled: false,
                    persist: "environment",
                  },
                },
              ]}
              editState={initialEditState()}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              theme={THEMES[0]!}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 3 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("[ ]")
    const span = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((candidate) => candidate.text.includes("disabled_token"))
    expect(span!.fg.equals(RGBA.fromHex(THEMES[0]!.textMuted))).toBe(true)
    const persistenceSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((candidate) => candidate.text.includes("Environment"))
    expect(persistenceSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.textMuted))).toBe(
      true,
    )
    cleanup()
  })

  it("activates and toggles form rows independently", async () => {
    const activations: Array<[number, boolean, "key" | "value" | undefined]> =
      []
    const toggles: number[] = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <FormEditor
            request={{
              bodyType: "multipart",
              formData: [
                {
                  name: "avatar",
                  value: "/tmp/avatar.png",
                  enabled: true,
                  type: "file",
                },
              ],
            }}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            browseActive={false}
            theme={THEMES[0]!}
            onActivateRow={(row, addingRow, subfield) =>
              activations.push([row, addingRow, subfield])
            }
            onToggleRow={(row) => toggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(8, 0, MouseButtons.LEFT)
    await mockMouse.click(60, 0, MouseButtons.LEFT)
    await mockMouse.click(1, 0, MouseButtons.LEFT)

    expect(activations).toEqual([
      [0, false, "key"],
      [0, false, "value"],
    ])
    expect(toggles).toEqual([0])
  })

  it("only highlights rows with an available mouse action", async () => {
    const { renderOnce, captureSpans, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <KeyValueSection
            kind="headers"
            entries={[
              {
                key: "Accept",
                value: { value: "application/json", enabled: true },
              },
            ]}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            theme={THEMES[0]!}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.moveTo(8, 0)
    await renderOnce()

    const elementColor = RGBA.fromHex(THEMES[0]!.backgroundElement)
    const span = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((candidate) => candidate.text.includes("Accept"))
    expect(span!.bg.equals(elementColor)).toBe(false)
  })

  it("focuses a clicked form value while editing", async () => {
    const focused: Array<"key" | "value"> = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <FormEditor
            request={{
              bodyType: "urlencoded",
              formData: [
                {
                  name: "username",
                  value: "john",
                  enabled: true,
                  type: "text",
                },
              ],
            }}
            editState={{
              mode: "editing",
              cursor: {
                field: "body",
                row: 1,
                addingRow: false,
                subfield: "key",
              },
              editingRow: 1,
            }}
            editKey="username"
            editValue="john"
            setEditKey={() => {}}
            setEditValue={() => {}}
            browseActive={false}
            theme={THEMES[0]!}
            onFocusSubfield={(subfield) => focused.push(subfield)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(60, 0, MouseButtons.LEFT)
    expect(focused).toEqual(["value"])
  })

  it("activates a new multipart value directly", async () => {
    const activations: Array<[number, boolean, "key" | "value" | undefined]> =
      []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <FormEditor
            request={{ bodyType: "multipart", formData: [] }}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            browseActive={false}
            theme={THEMES[0]!}
            onActivateRow={(row, addingRow, subfield) =>
              activations.push([row, addingRow, subfield])
            }
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(60, 0, MouseButtons.LEFT)
    expect(activations).toEqual([[-1, true, "value"]])
  })

  it("does not reactivate an add row while it is being edited", async () => {
    const activations: Array<[number, boolean]> = []
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={4}>
          <KeyValueSection
            kind="headers"
            entries={[]}
            editState={{
              mode: "editing",
              cursor: {
                field: "headers",
                row: -1,
                addingRow: true,
                subfield: "key",
              },
              editingRow: -1,
            }}
            editKey="Accept"
            editValue="application/json"
            setEditKey={() => {}}
            setEditValue={() => {}}
            theme={THEMES[0]!}
            onActivateRow={(row, addingRow) =>
              activations.push([row, addingRow])
            }
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(8, 0, MouseButtons.LEFT)
    expect(activations).toEqual([])
  })
})
