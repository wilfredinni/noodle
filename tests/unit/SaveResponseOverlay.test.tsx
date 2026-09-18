import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scheduler } from "node:timers/promises"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { getDownloadsDir } from "../../src/filestore/timeline"
import { collapseUserPath } from "../../src/userPath"
import {
  SaveResponseOverlay,
  type SaveResponseOverlayHandle,
} from "../../src/ui/overlays/SaveResponseOverlay"
import { useSingleFieldFormOverlayIntercept } from "../../src/ui/intercepts/useFormOverlayIntercept"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"
import {
  beginResponseFileSave,
  completeResponseFileSave,
} from "../../src/ui/commandActions"
import type { ResponseFilePending } from "../../src/ui/useOverlayState"

const testRender = createTestRender()
const pending: ResponseFilePending = {
  requestName: "Report",
  response: {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/pdf" },
    body: "",
    bodyBytes: new Uint8Array([0, 255, 128]),
    bodyKind: "binary",
    timeMs: 1,
  },
}
async function mount() {
  const { keymap, host } = setupKeymap()
  const ref = createRef<SaveResponseOverlayHandle>()
  const confirmed: string[] = []
  let cancelled = 0
  function Harness() {
    const actions = useSingleFieldFormOverlayIntercept({
      visible: true,
      handleRef: ref,
      onConfirm: (value) => confirmed.push(value),
      onCancel: () => cancelled++,
    })
    return (
      <>
        <VariableCompletionInterceptor />
        <SaveResponseOverlay
          ref={ref}
          pending={pending}
          onConfirm={actions.confirm}
          onClose={actions.cancel}
        />
      </>
    )
  }
  const setup = await act(async () =>
    testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 25 },
    ),
  )
  await act(async () => {
    await scheduler.yield()
    await setup.renderOnce()
  })
  const edit = async (value: string) => {
    await act(async () => {
      await setup.mockInput.pressKey("\x01")
      await setup.mockInput.pressKey("\x0b")
      await setup.mockInput.typeText(value)
    })
    await setup.renderOnce()
  }
  return { ...setup, ref, confirmed, host, edit, cancelled: () => cancelled }
}
describe("Save response overlay", () => {
  it("saves and closes through the shared form action buttons", async () => {
    const setup = await mount()
    await setup.edit("/tmp/new folder/download.bin")
    const rows = setup.captureCharFrame().split("\n")
    const footer = rows.findIndex((row) => row.includes("^S save"))
    expect(footer).toBeGreaterThanOrEqual(0)
    await act(async () => {
      await setup.mockMouse.click(rows[footer]!.indexOf("save"), footer)
    })
    expect(setup.confirmed).toEqual(["/tmp/new folder/download.bin"])
    await act(async () => {
      await setup.mockMouse.click(rows[footer]!.indexOf("close"), footer)
    })
    expect(setup.cancelled()).toBe(1)
  })
  it("suggests Downloads and preserves paths after inline save errors", async () => {
    const setup = await mount()
    expect(setup.ref.current!.confirm()).toBe(
      collapseUserPath(join(await getDownloadsDir(), "Report.pdf")),
    )
    await setup.edit("/tmp/new folder/download.bin")
    await act(() => setup.ref.current!.setError("Output already exists"))
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Output already exists")
    expect(setup.ref.current!.confirm()).toBe("/tmp/new folder/download.bin")
    await act(() => setup.host.press("s", { ctrl: true }))
    expect(setup.confirmed).toEqual(["/tmp/new folder/download.bin"])
    await act(() => setup.host.press("escape"))
    expect(setup.cancelled()).toBe(1)
  })
  it("requires a path and lets completion own Return and Escape before the modal", async () => {
    const setup = await mount()
    await setup.edit("")
    await act(() => setup.host.press("return"))
    await setup.renderOnce()
    expect(setup.confirmed).toEqual([])
    expect(setup.captureCharFrame()).toContain("Output file is required")
    await setup.edit("@/noodle/package.jso")
    const deadline = Date.now() + 2000
    while (!setup.captureCharFrame().includes("package.json")) {
      if (Date.now() > deadline)
        throw new Error("Path completion did not finish")
      await act(async () => {
        await scheduler.yield()
        await setup.renderOnce()
      })
    }
    await act(() => setup.host.press("return"))
    await setup.renderOnce()
    expect(setup.ref.current!.confirm()).toBe("@/noodle/package.json")
    expect(setup.confirmed).toEqual([])
    await act(() => setup.host.press("return"))
    expect(setup.confirmed).toEqual(["@/noodle/package.json"])
    await setup.edit("@/noodle/pack")
    await act(() => setup.host.press("escape"))
    expect(setup.cancelled()).toBe(0)
    await act(() => setup.host.press("escape"))
    expect(setup.cancelled()).toBe(1)
  })
  it("pins original bytes to the response selected when Save As opens", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-save-response-"))
    try {
      let selected: ResponseFilePending | undefined
      expect(
        beginResponseFileSave(
          { status: "done", response: pending.response },
          pending.requestName,
          (value) => {
            selected = value
          },
        ),
      ).toBe(true)
      expect(
        beginResponseFileSave(
          {
            status: "done",
            response: { ...pending.response, bodyBytes: undefined },
          },
          "Legacy",
          () => {
            throw new Error("Must not open")
          },
        ),
      ).toBe(false)
      const path = await completeResponseFileSave(
        selected!,
        join(root, "nested", "report.pdf"),
      )
      expect(Array.from(await readFile(path))).toEqual(
        Array.from(pending.response.bodyBytes!),
      )
      await expect(completeResponseFileSave(selected!, path)).rejects.toThrow(
        "already exists",
      )
      expect(Array.from(await readFile(path))).toEqual(
        Array.from(pending.response.bodyBytes!),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
