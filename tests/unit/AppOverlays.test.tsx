import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
import { addDefaultParsers } from "@opentui/core"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { makeOverlayState } from "./_overlayState"
import { ThemeProvider } from "../../src/ui/theme"
import { AppOverlays } from "../../src/ui/AppOverlays"
import { bindingDefaults } from "../../src/ui/keybind"
import type { OverlayState } from "../../src/ui/useOverlayState"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import { codeEditorParsers } from "../../src/ui/editor/codeEditorParsers"

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
addDefaultParsers([...codeEditorParsers])

const testRender = createTestRender()

const noop = () => {}
const actions = { confirm: noop, cancel: noop, clear: noop }

/** Props outside the overlay bag, with nothing visible. */
function baseProps() {
  return {
    keybinds: bindingDefaults(),
    reloadPending: false,
    collectionSwitchPending: null,
    collectionSwitcherVisible: false,
    requestCollectionSwitch: noop,
    setCollectionSwitcherVisible: noop,
    onConfirmDialog: noop,
    onCancelDialog: noop,
    commandPaletteCommands: [],
    codeGeneratorRequest: null,
    collection: null,
    requests: [],
    onFindRequest: noop,
    collectionPaths: [],
    collectionSettingsByPath: {},
    collectionDir: "/tmp/collection",
    environmentNames: [],
    activeEnvironmentName: null,
    onSelectEnvironment: noop,
    onOpenEnvironmentEditor: noop,
    previewIndex: null,
    activeIndex: 0,
    setPreviewIndex: noop,
    onThemeChange: noop,
    setCollectionReloadToken: noop,
    resetRequestDraft: noop,
    resetFolderDraftByPath: noop,
    setFocus: noop,
    setSaveState: noop,
    clearSaveTimer: noop,
    saveTimerRef: createRef<ReturnType<typeof setTimeout> | null>(),
    newEnvironmentActions: actions,
    cookieFormActions: actions,
    newRequestActions: actions,
    newRequestInitialFolder: "",
    importCurlActions: actions,
    importCurlInitialFolder: "",
    exportCollectionActions: actions,
    importCollectionActions: actions,
    importCollectionInitialParent: "~/",
    activeEnv: null,
    selectedRequest: null,
    folderPaths: [],
    editRequestInitialFolder: "",
    editRequestActions: actions,
    cloneRequestActions: actions,
    newFolderActions: actions,
    tagEditorActions: actions,
    tagSuggestions: [],
    updateFlow: { phase: "idle" as const },
    envColors: {},
    onLoadTimelineBody: async () => "",
    onCopyTimelineHeaders: noop,
    onCopyTimelineBody: noop,
    onExportTimelineBody: async () => {},
    onEditRunnerRequestTab: noop,
  } as unknown as Omit<Parameters<typeof AppOverlays>[0], "overlays">
}

/**
 * Renders the overlay layer with one overlay enabled, so a field wired to the
 * wrong overlay shows up as the wrong text on screen.
 */
async function renderOverlays(
  overlayState: Partial<OverlayState>,
  extraProps: Partial<Parameters<typeof AppOverlays>[0]> = {},
) {
  const { keymap, host, cleanup } = setupKeymap()
  const props = {
    ...baseProps(),
    overlays: makeOverlayState(overlayState),
    ...extraProps,
  } as Parameters<typeof AppOverlays>[0]
  const { renderOnce, captureCharFrame } = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <AppOverlays {...props} />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 100, height: 32 },
  )
  await act(async () => {
    await renderOnce()
    await renderOnce()
  })
  // Overlay text wraps to the frame width, so compare against a
  // whitespace-normalized frame instead of the raw character grid.
  const frame = captureCharFrame().replace(/\s+/g, " ").trim()
  return { frame, host, renderOnce, captureCharFrame, cleanup }
}

describe("AppOverlays routing", () => {
  it("should render no overlay when every overlay is hidden", async () => {
    const { frame, cleanup } = await renderOverlays({})
    expect(frame).toBe("")
    cleanup()
  })

  /**
   * The confirmation dialogs share one component and are distinguished only by
   * `activeOverlay` plus a pending value, so a swapped field is invisible to
   * the type checker. Each case pins one field to one message.
   */
  const confirmCases: {
    name: string
    overrides: Partial<OverlayState>
    expected: string
  }[] = [
    {
      name: "env-delete",
      overrides: { activeOverlay: "env-delete", envDeletePending: "staging" },
      expected: 'Delete environment "staging"?',
    },
    {
      name: "collection-unregister",
      overrides: {
        activeOverlay: "collection-unregister",
        collectionUnregisterPending: "/tmp/other",
      },
      expected: "Unregister collection",
    },
    {
      name: "undo-all",
      overrides: { activeOverlay: "undo-all", undoAllPending: true },
      expected: "Discard all unsaved changes?",
    },
    {
      name: "init-confirm",
      overrides: { activeOverlay: "init-confirm", initPending: true },
      expected: "Initialize collection in",
    },
    {
      name: "import-open-confirm",
      overrides: {
        activeOverlay: "import-open-confirm",
        importOpenPending: { path: "/tmp/imported", name: "Imported API" },
      },
      expected: "Open it now?",
    },
    {
      name: "delete-folder",
      overrides: {
        activeOverlay: "delete-folder",
        folderDeletePending: "auth",
      },
      expected: 'Delete folder "auth" and all requests inside?',
    },
    {
      name: "request-delete",
      overrides: {
        activeOverlay: "request-delete",
        requestDeletePending: "users/get",
      },
      expected: 'Delete "users/get"?',
    },
    {
      name: "cookie-delete",
      overrides: {
        activeOverlay: "cookie-delete",
        cookieDeletePending: {
          kind: "cookie",
          name: "session",
          domain: "example.com",
          path: "/",
        },
      },
      expected: 'Delete cookie "session" from example.com?',
    },
  ]

  for (const testCase of confirmCases) {
    it(`should render the ${testCase.name} confirmation`, async () => {
      const { frame, cleanup } = await renderOverlays(testCase.overrides)
      expect(frame).toContain(testCase.expected)
      cleanup()
    })
  }

  it("should render only the pending confirmation that matches activeOverlay", async () => {
    const { frame, cleanup } = await renderOverlays({
      activeOverlay: "request-delete",
      requestDeletePending: "users/get",
      folderDeletePending: "auth",
      envDeletePending: "staging",
    })
    expect(frame).toContain('Delete "users/get"?')
    expect(frame).not.toContain("Delete folder")
    expect(frame).not.toContain("Delete environment")
    cleanup()
  })

  const visibilityCases: {
    name: string
    overrides: Partial<OverlayState>
    expected: string
  }[] = [
    {
      name: "help",
      overrides: { activeOverlay: "help", helpVisible: true },
      expected: "Keybindings",
    },
    {
      name: "about",
      overrides: { activeOverlay: "about", aboutVisible: true },
      expected: "Noodle",
    },
    {
      name: "new request",
      overrides: { activeOverlay: "new-request", newRequestVisible: true },
      expected: "New Request",
    },
    {
      name: "clone request",
      overrides: { activeOverlay: "clone-request", cloneRequestVisible: true },
      expected: "Clone Request",
    },
    {
      name: "new folder",
      overrides: { activeOverlay: "new-folder", newFolderVisible: true },
      expected: "New Folder",
    },
    {
      name: "tag editor",
      overrides: {
        activeOverlay: "tag-editor",
        tagEditPending: { kind: "request", index: 0, value: "smoke" },
      },
      expected: "Edit Tag",
    },
    {
      name: "new environment",
      overrides: {
        activeOverlay: "new-environment",
        newEnvironmentVisible: true,
      },
      expected: "New Environment",
    },
    {
      name: "import curl",
      overrides: { activeOverlay: "import-curl", importCurlVisible: true },
      expected: "Import cURL",
    },
    {
      name: "cookie form",
      overrides: { activeOverlay: "cookie-form", cookieFormVisible: true },
      expected: "Cookie",
    },
  ]

  for (const testCase of visibilityCases) {
    it(`should render the ${testCase.name} overlay`, async () => {
      const { frame, cleanup } = await renderOverlays(testCase.overrides)
      expect(frame).toContain(testCase.expected)
      cleanup()
    })
  }

  it("replaces the footer close action with delete when editing a request tag", async () => {
    const { frame, cleanup } = await renderOverlays({
      activeOverlay: "tag-editor",
      tagEditPending: { kind: "request", index: 0, value: "smoke" },
    })
    expect(frame).toContain("^D delete")
    expect(frame).not.toContain("esc close")
    cleanup()
  })

  it("labels Runner filters contextually and offers delete only when set", async () => {
    const existing = await renderOverlays({
      activeOverlay: "tag-editor",
      tagEditPending: {
        kind: "runner-filter",
        filter: "include",
        index: 0,
        value: "smoke",
      },
    })
    expect(existing.frame).toContain("Include Tag")
    expect(existing.frame).toContain("^D delete")
    existing.cleanup()

    const empty = await renderOverlays(
      {
        activeOverlay: "tag-editor",
        tagEditPending: {
          kind: "runner-filter",
          filter: "exclude",
          index: 0,
          value: "",
        },
      },
      { tagSuggestions: ["users", "smoke", "users"] },
    )
    expect(empty.frame).toContain("Exclude Tag")
    expect(empty.frame).not.toContain("delete")
    expect(empty.frame.indexOf("smoke")).toBeLessThan(
      empty.frame.indexOf("users"),
    )
    expect(empty.frame.match(/users/g)).toHaveLength(1)
    empty.cleanup()
  })

  it("should render the environment picker with its environments", async () => {
    const { frame, cleanup } = await renderOverlays(
      { activeOverlay: "environment-picker", environmentPickerVisible: true },
      {
        environmentNames: ["development", "staging"],
        activeEnvironmentName: "development",
      },
    )
    expect(frame).toContain("development")
    expect(frame).toContain("staging")
    cleanup()
  })

  it("should render the collection switcher with registered collections", async () => {
    const { frame, cleanup } = await renderOverlays(
      { activeOverlay: "collection-switcher" },
      {
        collectionSwitcherVisible: true,
        collectionPaths: ["/tmp/alpha", "/tmp/beta"],
      },
    )
    expect(frame).toContain("alpha")
    expect(frame).toContain("beta")
    cleanup()
  })

  /**
   * The reload guard and the collection switcher own their own pending state,
   * so they stay separate props rather than joining the overlay bag.
   */
  it("should render the reload confirmation from its own prop", async () => {
    const { frame, cleanup } = await renderOverlays(
      { activeOverlay: "reload-confirm" },
      { reloadPending: true },
    )
    expect(frame).toContain("Reload collection and discard unsaved changes?")
    cleanup()
  })

  it("should render the collection switch confirmation from its own prop", async () => {
    const { frame, cleanup } = await renderOverlays(
      { activeOverlay: "collection-switch-confirm" },
      { collectionSwitchPending: "/tmp/next" },
    )
    expect(frame).toContain("and discard unsaved changes?")
    cleanup()
  })

  it("opens Runner details on Request and routes edits from Results", async () => {
    const closed: unknown[] = []
    const edits: string[] = []
    const { frame, host, renderOnce, cleanup } = await renderOverlays(
      {
        activeOverlay: "timeline-detail",
        runnerDetail: {
          entry: {
            timestamp: 1,
            request: {
              id: "health",
              name: "Health",
              method: "GET",
              url: "https://example.com/health",
              headers: {},
              params: [],
            },
            response: {
              status: 200,
              statusText: "OK",
              headers: {},
              body: "ready",
              timeMs: 1,
              size: 5,
            },
          },
          execution: {
            assertions: { evaluated: true, results: [] },
          },
          request: {
            assertions: [
              { expression: "status", operator: "equals", value: 200 },
            ],
          },
        },
        setRunnerDetail: (detail) => closed.push(detail),
      },
      {
        onEditRunnerRequestTab: (requestId, tab) =>
          edits.push(`${requestId}:${tab}`),
      },
    )

    expect(frame).toContain("GET https://example.com/health")
    await act(async () => host.press("right"))
    await act(async () => host.press("right"))
    await renderOnce()
    await act(async () => host.press("a"))
    expect(closed).toEqual([null])
    expect(edits).toEqual(["health:assertions"])
    cleanup()
  })
})
