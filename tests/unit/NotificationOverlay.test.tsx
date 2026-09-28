import { describe, expect, it, jest } from "bun:test"
import { act, useRef } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { Toast, showToast, takeToastMessage } from "../../src/ui/Toast"
import { NotificationOverlay } from "../../src/ui/overlays/NotificationOverlay"
import { useOverlayState } from "../../src/ui/useOverlayState"
import { ConfirmOverlay } from "../../src/ui/overlays/ConfirmOverlay"
import { formatCollectionImportMessage } from "../../src/ui/collectionImport"
import { useDialogIntercepts } from "../../src/ui/intercepts/useDialogIntercepts"
import type { UseEnvironmentEditorResult } from "../../src/hooks/useEnvironmentEditor"
import { useModalKeyboardShield } from "../../src/ui/useModalKeyboardShield"

const testRender = createTestRender()

describe("Notification details", () => {
  it("retains expired warnings, scrolls with the keyboard, and returns to the editor", async () => {
    const { keymap, host } = setupKeymap()
    let openDetails: () => void = () => {}
    const backgroundKeys: string[] = []
    keymap.intercept("key", ({ event }) => {
      backgroundKeys.push(event.name)
    })
    function Harness() {
      const overlays = useOverlayState({
        previewIndex: null,
        collectionSwitcherVisible: false,
        collectionSwitchPending: null,
        reloadPending: false,
      })
      useModalKeyboardShield(overlays.activeOverlay)
      openDetails = () => overlays.setNotificationMessage(takeToastMessage())
      return (
        <>
          <input id="request-url" focused={overlays.activeOverlay === "none"} />
          <Toast />
          {overlays.notificationMessage !== null && (
            <NotificationOverlay
              message={overlays.notificationMessage}
              onClose={() => overlays.setNotificationMessage(null)}
            />
          )}
        </>
      )
    }
    const setup = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 10 },
    )
    jest.useFakeTimers()
    try {
      const message = [
        "Demo / Login (pre-request)",
        ...Array.from(
          { length: 15 },
          (_, i) => `Demo / Users ${i} (after-response)`,
        ),
        "Foreign runtime APIs were not converted.",
      ].join("\n")
      act(() => showToast(message, "warning"))
      act(() => jest.advanceTimersByTime(5001))
      await setup.renderOnce()
      expect(setup.captureCharFrame()).not.toContain("Demo / Login")
      act(() => openDetails())
      await setup.renderOnce()
      const scroll = setup.renderer.root.findDescendantById(
        "notification-details",
      ) as ScrollBoxRenderable
      const input = setup.renderer.root.findDescendantById(
        "request-url",
      ) as InputRenderable
      expect(setup.captureCharFrame()).toContain("Demo / Login")
      expect(scroll.focused).toBe(true)
      for (const key of ["down", "up", "pagedown", "pageup", "end"]) {
        act(() => host.press(key))
        await setup.renderOnce()
        if (key === "pagedown") expect(scroll.scrollTop).toBeGreaterThan(1)
      }
      expect(setup.captureCharFrame()).toContain("converted.")
      act(() => {
        jest.advanceTimersByTime(60_000)
        host.press("s", { ctrl: true })
        host.press("x")
      })
      await setup.renderOnce()
      expect(setup.captureCharFrame()).toContain("converted.")
      expect(backgroundKeys).toEqual([])
      expect(input.value).toBe("")
      act(() => {
        setup.resize(10, 10)
        host.press("home")
      })
      await setup.renderOnce()
      expect(scroll.scrollTop).toBe(0)
      expect(scroll.y).toBeGreaterThanOrEqual(0)
      expect(scroll.y + scroll.height).toBeLessThanOrEqual(10)
      act(() => host.press("end"))
      await setup.renderOnce()
      expect(scroll.scrollTop).toBeGreaterThan(0)
      act(() => {
        setup.resize(40, 10)
        host.press("escape")
      })
      await setup.renderOnce()
      expect(input.focused).toBe(true)
      expect(
        setup.renderer.root.findDescendantById("notification-details"),
      ).toBeUndefined()
      await act(async () => {
        await setup.mockInput.typeText("https://example.test")
      })
      expect(input.value).toBe("https://example.test")
    } finally {
      jest.useRealTimers()
    }
  })
})

it("shows new-import warnings before the open confirmation, with no toast hiding the decision", async () => {
  const { keymap, host } = setupKeymap()
  let imported: () => void = () => {}
  let confirmed = 0
  function Harness() {
    const overlays = useOverlayState({
      previewIndex: null,
      collectionSwitcherVisible: false,
      collectionSwitchPending: null,
      reloadPending: false,
    })
    useModalKeyboardShield(overlays.activeOverlay)
    const actions = useDialogIntercepts({
      overlays,
      setSaveState: () => {},
      onCollectionUnregisterConfirm: () => {},
      envEditorRef: useRef<UseEnvironmentEditorResult>(null!),
      clearSaveTimer: () => {},
      saveTimerRef: useRef<ReturnType<typeof setTimeout> | null>(null),
      collectionSwitchPending: null,
      setCollectionSwitchPending: () => {},
      onCollectionSwitchConfirm: () => {},
      onImportOpenConfirm: () => {
        confirmed++
      },
      onReloadConfirm: () => {},
      onReloadCancel: () => {},
      onRequestDeleteConfirm: () => {},
      onRequestDeleteCancel: () => {},
      onFolderDeleteConfirm: () => {},
      onCookieDeleteConfirm: () => {},
      draftRef: useRef({ revertAllRequests: () => {} }),
      folderDraftRef: useRef({ revertAllFolders: () => {} }),
      onInitConfirm: () => {},
    })
    imported = () => {
      overlays.setNotificationMessage(
        formatCollectionImportMessage(
          ["one", "two", "three"].map((name) => ({
            code: "foreign-script-not-converted",
            format: "postman",
            itemPath: [name],
            phase: "prerequest",
            unsupportedGlobals: ["pm", "require"],
            message: "",
          })),
        ),
      )
      overlays.setImportOpenPending({ path: "/tmp/imported", name: "Imported" })
    }
    return (
      <>
        <input id="request-url" focused={overlays.activeOverlay === "none"} />
        <Toast />
        {overlays.activeOverlay === "notification" && (
          <NotificationOverlay
            message={overlays.notificationMessage!}
            onClose={() => overlays.setNotificationMessage(null)}
          />
        )}
        {overlays.activeOverlay === "import-open-confirm" && (
          <ConfirmOverlay
            visible
            message='Imported "Imported". Open it now?'
            onConfirm={actions.onConfirm}
            onCancel={actions.onCancel}
          />
        )}
      </>
    )
  }
  const setup = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 80, height: 24 },
  )
  for (const key of ["y", "n"]) {
    act(() => imported())
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Unsupported: pm, require")
    expect(setup.captureCharFrame()).not.toContain("Open it now?")
    for (const width of [40, 80]) {
      act(() => setup.resize(width, 24))
      await setup.renderOnce()
      expect(setup.captureCharFrame()).toContain("Unsupported: pm, require")
    }
    act(() => host.press("escape"))
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Open it now?")
    expect(setup.captureCharFrame()).toContain("confirm")
    expect(setup.captureCharFrame()).toContain("cancel")
    expect(setup.captureCharFrame()).not.toContain("Unsupported:")
    act(() => host.press(key))
    await setup.renderOnce()
    expect(setup.renderer.root.findDescendantById("request-url")?.focused).toBe(
      true,
    )
  }
  expect(confirmed).toBe(1)
})
