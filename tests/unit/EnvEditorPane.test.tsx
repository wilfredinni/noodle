import { describe, expect, it } from "bun:test"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { act } from "react"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { EnvEditorPane } from "../../src/ui/env-editor/EnvEditorPane"

const testRender = createTestRender()

const inactive = {
  mode: "inactive" as const,
  row: -1,
  addingRow: false,
  editingRow: -1,
}

describe("EnvEditorPane", () => {
  it("masks secrets, shows only process, and colors missing keys", async () => {
    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={12}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "TOKEN",
                  value: "do-not-render",
                  enabled: true,
                  secret: true,
                  secretStatus: "keychain",
                },
                {
                  id: 2,
                  key: "PROCESS_TOKEN",
                  value: "process-value-must-stay-masked",
                  enabled: true,
                  secret: true,
                  originSecret: true,
                  secretStatus: "process",
                },
                {
                  id: 3,
                  key: "MISSING_TOKEN",
                  value: "",
                  enabled: true,
                  secret: true,
                  secretStatus: "missing",
                },
                {
                  id: 4,
                  key: "DISABLED_TOKEN",
                  value: "",
                  enabled: false,
                  secret: true,
                  secretStatus: "disabled",
                },
              ],
            }}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("do-not-render")
    expect(frame).not.toContain("process-value-must-stay-masked")
    expect(frame).toContain("••••••••")
    expect(frame).not.toContain("keychain")
    expect(frame).not.toContain("missing")
    expect(frame).not.toContain("disabled")
    expect(frame).not.toContain("hide")
    const processLine = frame
      .split("\n")
      .find((line) => line.includes("PROCESS_TOKEN"))!
    expect(processLine).toContain("process")
    expect(processLine.indexOf("[secret]")).toBeGreaterThan(
      processLine.indexOf("process"),
    )

    const missingKeySpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("MISSING_TOKEN"))
    expect(missingKeySpan).toBeDefined()
    expect(missingKeySpan!.fg.equals(RGBA.fromHex(THEMES[0]!.error))).toBe(true)
  })

  it("reveals a secret value while editing it", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "TOKEN",
                  value: "keychain-value",
                  enabled: true,
                  secret: true,
                  originSecret: true,
                  secretStatus: "keychain",
                },
              ],
            }}
            editState={{
              mode: "editing",
              row: 0,
              addingRow: false,
              subfield: "value",
              editingRow: 0,
            }}
            editKey="TOKEN"
            editValue="keychain-value"
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("keychain-value")
    expect(frame).not.toContain("••••••••")
  })

  it("aligns value columns for plain, secret, and new variables", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={100} height={9}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "BASE_URL",
                  value: "plain-value",
                  enabled: true,
                },
                {
                  id: 2,
                  key: "TOKEN",
                  value: "secret-value",
                  enabled: true,
                  secret: true,
                  originSecret: true,
                  secretStatus: "keychain",
                },
              ],
            }}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
          />
        </box>
      </ThemeProvider>,
      { width: 100, height: 9 },
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const plainLine = lines.find((line) => line.includes("BASE_URL"))!
    const secretLine = lines.find((line) => line.includes("TOKEN"))!
    const addLine = lines.find((line) => line.includes("Key..."))!

    expect(plainLine.indexOf("plain-value")).toBe(
      secretLine.indexOf("••••••••"),
    )
    expect(addLine.indexOf("Value...")).toBe(secretLine.indexOf("••••••••"))
  })

  it("commits when clicking pane background but not the active input", async () => {
    let interactions = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "BASE_URL",
                  value: "https://api.test",
                  enabled: true,
                },
              ],
            }}
            editState={{
              mode: "editing",
              row: 0,
              addingRow: false,
              subfield: "value",
              editingRow: 0,
            }}
            editKey="BASE_URL"
            editValue="https://api.test"
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
            onInteraction={() => interactions++}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const valueRow = lines.findIndex((line) =>
      line.includes("https://api.test"),
    )
    if (valueRow < 0) throw new Error("environment value row was not rendered")
    const valueColumn = lines[valueRow]!.indexOf("https://api.test")
    await mockMouse.click(valueColumn, valueRow, MouseButtons.LEFT)
    expect(interactions).toBe(0)

    await mockMouse.click(70, 6, MouseButtons.LEFT)
    expect(interactions).toBe(1)
  })

  it("shows a variables jump badge in jump mode", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={null}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused={false}
            jumpMode
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    expect(spans.map((span) => span.text)).toContain("v")
    expect(spans.map((span) => span.text).join("")).not.toContain("Variables")
  })

  it("activates rows, toggles checkboxes, and activates the add row", async () => {
    const activations: Array<[number, boolean, "key" | "value" | undefined]> =
      []
    const toggles: number[] = []
    const secretToggles: number[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "BASE_URL",
                  value: "https://api.test",
                  enabled: true,
                },
              ],
            }}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
            onActivateRow={(row, addingRow, subfield) =>
              activations.push([row, addingRow, subfield])
            }
            onToggleRow={(row) => toggles.push(row)}
            onToggleSecret={(row) => secretToggles.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    const lines = captureCharFrame().split("\n")
    const variableRow = lines.findIndex((line) => line.includes("BASE_URL"))
    const valueColumn = lines[variableRow]!.indexOf("https://api.test")

    await act(async () => {
      await mockMouse.click(10, variableRow, MouseButtons.LEFT)
      await mockMouse.click(valueColumn, variableRow, MouseButtons.LEFT)
      await mockMouse.click(2, variableRow, MouseButtons.LEFT)
      await mockMouse.click(77, variableRow, MouseButtons.LEFT)
      await mockMouse.click(10, variableRow + 1, MouseButtons.LEFT)
    })

    expect(activations).toEqual([
      [0, false, "key"],
      [0, false, "value"],
      [-1, true, "key"],
    ])
    expect(toggles).toEqual([0])
    expect(secretToggles).toEqual([0])
  })

  it("does not activate process-sourced secret fields", async () => {
    const activations: number[] = []
    const reveals: number[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={8}>
          <EnvEditorPane
            draft={{
              name: "development",
              color: undefined,
              varRows: [
                {
                  id: 1,
                  key: "PROCESS_TOKEN",
                  value: "process-value",
                  enabled: true,
                  secret: true,
                  originSecret: true,
                  secretStatus: "process",
                },
              ],
            }}
            editState={inactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            saving={false}
            error={null}
            focused
            onActivateRow={(row) => activations.push(row)}
            onRevealSecret={(row) => reveals.push(row)}
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const row = lines.findIndex((line) => line.includes("PROCESS_TOKEN"))
    if (row < 0) throw new Error("process secret row was not rendered")

    await act(async () => {
      await mockMouse.click(lines[row]!.indexOf("PROCESS_TOKEN"), row)
      await mockMouse.click(45, row)
      await mockMouse.click(60, row)
    })

    expect(activations).toEqual([])
    expect(reveals).toEqual([0])
  })
})
