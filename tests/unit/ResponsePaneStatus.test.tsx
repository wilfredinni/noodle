import { describe, it, expect } from "bun:test"
import { extend } from "@opentui/react"
import { createTestRender } from "../testRender"
import { TextAttributes } from "@opentui/core"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { act, useState } from "react"
import { RequestResponseView } from "../../src/ui/RequestResponseView"
import { ThemeProvider } from "../../src/ui/theme"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import type { SendState } from "../../src/ui/sendState"
import {
  getAvailableTargets,
  computeRequestTabLabels,
} from "../../src/ui/useJumpMode"
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"

const testRender = createTestRender()

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})

describe("ResponsePane status text truncation and layout tests", () => {
  const createTestProps = () => {
    const keymap = createTestKeymap()
    const draft = {
      draft: {
        method: "GET" as const,
        url: "https://api.example.com",
        headers: {},
        params: [],
        auth: { type: "none" as const },
        bodyType: "json" as const,
      },
      setUrl: () => {},
      setMethod: () => {},
      syncUrlParams: () => {},
      setAuthType: () => {},
      setApiKeyPlacement: () => {},
      setBodyType: () => {},
      dirtyRequestIds: new Set<string>(),
    }
    const eb = {
      editState: {
        mode: "browsing" as const,
        cursor: { field: "body" as const, index: 0 },
      },
      editKey: "",
      editValue: "",
      setEditKey: () => {},
      setEditValue: () => {},
      activeTab: "body" as const,
    }
    return { keymap, draft, eb }
  }

  it("prefers the current response, then the newest timeline response", async () => {
    const { keymap, draft } = createTestProps()
    const eb = {
      editState: {
        mode: "editing" as const,
        cursor: {
          field: "assertions" as const,
          row: 0,
          addingRow: false,
          subfield: "key" as const,
        },
        editingRow: 0,
      },
      editKey: "body.",
      editValue: "",
      editOperator: "exists" as const,
      editError: null,
      setEditKey: () => {},
      setEditValue: () => {},
      setEditOperator: () => {},
      activeTab: "assertions" as const,
      focusSubfield: () => {},
    }
    const timelineEntries = [
      {
        timestamp: 3,
        request: {
          id: "request",
          name: "Request",
          method: "GET" as const,
          url: "https://example.com",
          headers: {},
          params: [],
        },
        error: { message: "newer failed request" },
      },
      {
        timestamp: 2,
        request: {
          id: "request",
          name: "Request",
          method: "GET" as const,
          url: "https://example.com",
          headers: {},
          params: [],
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: '{"newestField":1}',
          timeMs: 2,
          size: 17,
        },
      },
      {
        timestamp: 1,
        request: {
          id: "request",
          name: "Request",
          method: "GET" as const,
          url: "https://example.com",
          headers: {},
          params: [],
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: '{"olderField":1}',
          timeMs: 1,
          size: 16,
        },
      },
    ]
    let showCurrentResponse = () => {}
    function Harness() {
      const [responseState, setResponseState] = useState<SendState>({
        status: "idle",
      })
      showCurrentResponse = () =>
        setResponseState({
          status: "done",
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: '{"currentField":1}',
            timeMs: 1,
          },
        })
      return (
        <RequestResponseView
          draft={
            {
              ...draft,
              draft: {
                ...draft.draft,
                assertions: [
                  { expression: "body.", operator: "exists" as const },
                ],
              },
            } as unknown as Parameters<typeof RequestResponseView>[0]["draft"]
          }
          eb={eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]}
          error={null}
          focus="request"
          layout="stacked"
          expanded="request"
          activeEnv={null}
          responseState={responseState}
          timelineEntries={timelineEntries}
          onResponseTabChange={() => {}}
          setSelectOpen={() => {}}
          urlbarSubFocus="text"
          urlbarInteractive
        />
      )
    }

    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap.keymap as unknown as Parameters<
            typeof KeymapProvider
          >[0]["keymap"]
        }
      >
        <VariableCompletionInterceptor />
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 60, height: 14 }}>
            <Harness />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 14 },
    )
    await render.renderOnce()
    await act(async () => render.renderOnce())
    expect(render.captureCharFrame()).toContain("newestField")
    expect(render.captureCharFrame()).not.toContain("olderField")

    await act(async () => showCurrentResponse())
    await render.renderOnce()
    await act(async () => render.renderOnce())
    expect(render.captureCharFrame()).toContain("currentField")
    expect(render.captureCharFrame()).not.toContain("newestField")
  })

  it("uses XML highlighting for XML response content types", async () => {
    const { keymap, draft, eb } = createTestProps()
    const responseOK: SendState = {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: "<Envelope><Value>ok</Value></Envelope>",
        timeMs: 123,
      },
    }

    const { renderer, renderOnce } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 100, height: 20 }}>
            <RequestResponseView
              draft={
                draft as unknown as Parameters<
                  typeof RequestResponseView
                >[0]["draft"]
              }
              eb={
                eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]
              }
              error={null}
              focus="response"
              layout="stacked"
              expanded={null}
              activeEnv={null}
              responseState={responseOK}
              timelineEntries={[]}
              onResponseTabChange={() => {}}
              setSelectOpen={() => {}}
              urlbarSubFocus="text"
              urlbarInteractive={true}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "response-body-editor",
    ) as CodeEditorRenderable
    expect(editor.filetype).toBe("xml")
  })

  it("renders short status text (≤5 chars) unchanged", async () => {
    const { keymap, draft, eb } = createTestProps()
    const responseOK: SendState = {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: '{"ok":true}',
        timeMs: 123,
      },
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 100, height: 20, flexDirection: "column" }}>
            <RequestResponseView
              draft={
                draft as unknown as Parameters<
                  typeof RequestResponseView
                >[0]["draft"]
              }
              eb={
                eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]
              }
              error={null}
              focus="response"
              layout="stacked"
              expanded={null}
              activeEnv={null}
              responseState={responseOK}
              timelineEntries={[]}
              onResponseTabChange={() => {}}
              setSelectOpen={() => {}}
              urlbarSubFocus="text"
              urlbarInteractive={true}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("200 OK")
  })

  it("clips a stacked response editor to its viewport and scrolls to the tail", async () => {
    const { keymap: keymapHarness, draft, eb } = createTestProps()
    const keymap = keymapHarness.keymap
    keymap.setData("app.overlay", "none")
    const responseOK: SendState = {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify(
          Array.from({ length: 100 }, (_, index) => ({
            id: index,
            label: `item-${index}`,
          })),
          null,
          2,
        ),
        timeMs: 123,
      },
    }

    const { renderer, renderOnce, captureCharFrame, mockInput } =
      await testRender(
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box style={{ width: 100, height: 21, flexDirection: "column" }}>
              <RequestResponseView
                draft={
                  draft as unknown as Parameters<
                    typeof RequestResponseView
                  >[0]["draft"]
                }
                eb={
                  eb as unknown as Parameters<
                    typeof RequestResponseView
                  >[0]["eb"]
                }
                error={null}
                focus="response"
                layout="stacked"
                expanded={null}
                activeEnv={null}
                responseState={responseOK}
                timelineEntries={[]}
                onResponseTabChange={() => {}}
                setSelectOpen={() => {}}
                urlbarSubFocus="text"
                urlbarInteractive={true}
              />
              <text>response footer sentinel</text>
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 21 },
      )
    await renderOnce()
    await renderOnce()

    const bodyEditor = renderer.root.findDescendantById("response-body-editor")
    const bodyScrollbar = renderer.root.findDescendantById(
      "response-body-scrollbar",
    )
    expect(bodyEditor).toBeInstanceOf(CodeEditorRenderable)
    expect(bodyScrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    const editor = bodyEditor as CodeEditorRenderable
    const scrollbar = bodyScrollbar as CodeEditorScrollBarRenderable
    expect(editor.parent).not.toBeNull()
    expect(editor.parent!.height).toBeLessThan(editor.totalVirtualLineCount)
    const initialFrame = captureCharFrame()
    expect(initialFrame).not.toContain("item-99")
    const lines = initialFrame.split("\n")
    const responseBottom = lines.findLastIndex((line) => line.startsWith("└"))
    expect(responseBottom).toBeGreaterThan(0)
    expect(editor.y + editor.height).toBe(responseBottom)
    expect(scrollbar.y + scrollbar.height).toBe(responseBottom)
    expect(
      lines
        .slice(responseBottom + 1)
        .join("\n")
        .trimEnd(),
    ).toBe("response footer sentinel")

    await act(async () => mockInput.pressKey("END"))
    await renderOnce()
    const tailLines = captureCharFrame().split("\n")
    expect(tailLines.join("\n")).toContain("item-99")
    expect(tailLines[responseBottom - 1]).toMatch(/\]\s/)
  })

  it("keeps request and response folds through layout and expand changes", async () => {
    const { keymap, draft, eb } = createTestProps()
    keymap.keymap.setData("app.overlay", "none")
    const body = JSON.stringify(
      {
        object: { nested: true },
        array: [1, 2],
      },
      null,
      2,
    )
    const responseOK: SendState = {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body,
        timeMs: 123,
      },
    }
    let changeLayout = (_layout: "stacked" | "side-by-side") => {}
    let changeExpanded = (_expanded: "request" | "response" | null) => {}
    let responseTabChanges = 0
    const onResponseTabChange = () => {
      responseTabChanges += 1
    }

    function FoldPersistenceHarness() {
      const [layout, setLayout] = useState<"stacked" | "side-by-side">(
        "stacked",
      )
      const [expanded, setExpanded] = useState<"request" | "response" | null>(
        null,
      )
      changeLayout = setLayout
      changeExpanded = setExpanded

      return (
        <RequestResponseView
          draft={
            {
              ...draft,
              draft: { ...draft.draft, id: "folds", body },
            } as unknown as Parameters<typeof RequestResponseView>[0]["draft"]
          }
          eb={eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]}
          error={null}
          focus="response"
          layout={layout}
          expanded={expanded}
          activeEnv={null}
          responseState={responseOK}
          timelineEntries={[]}
          onResponseTabChange={onResponseTabChange}
          setSelectOpen={() => {}}
          urlbarSubFocus="text"
          urlbarInteractive={true}
          responseKey="folds"
        />
      )
    }

    const { renderer, renderOnce, captureCharFrame, mockInput } =
      await testRender(
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box style={{ width: 100, height: 24, flexDirection: "column" }}>
              <FoldPersistenceHarness />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 24 },
      )
    await renderOnce()

    const requestEditor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    const responseEditor = renderer.root.findDescendantById(
      "response-body-editor",
    ) as CodeEditorRenderable
    await Promise.all([
      requestEditor.refreshHighlights(),
      responseEditor.refreshHighlights(),
    ])
    for (const editor of [requestEditor, responseEditor]) {
      editor.toggleFold(4)
      editor.toggleFold(1)
    }
    await renderOnce()

    const expectFolds = (editor: CodeEditorRenderable) => {
      expect(editor.getFolds().get(1)?.folded).toBe(true)
      expect(editor.getFolds().get(4)?.folded).toBe(true)
    }

    act(() => changeLayout("side-by-side"))
    await renderOnce()
    expect(renderer.root.findDescendantById("request-body-editor")).toBe(
      requestEditor,
    )
    expect(renderer.root.findDescendantById("response-body-editor")).toBe(
      responseEditor,
    )
    expectFolds(requestEditor)
    expectFolds(responseEditor)

    act(() => changeExpanded("request"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Request")
    expect(captureCharFrame()).not.toContain("Response")
    expect(responseEditor.focused).toBe(false)
    await act(async () => mockInput.pressKey("RIGHT"))
    await renderOnce()
    expect(responseTabChanges).toBe(0)
    act(() => changeExpanded(null))
    await renderOnce()
    expect(renderer.root.findDescendantById("response-body-editor")).toBe(
      responseEditor,
    )
    expectFolds(responseEditor)

    act(() => changeExpanded("response"))
    await renderOnce()
    expect(captureCharFrame()).not.toContain("Request")
    expect(captureCharFrame()).toContain("Response")
    act(() => changeExpanded(null))
    await renderOnce()
    expect(renderer.root.findDescendantById("request-body-editor")).toBe(
      requestEditor,
    )
    expectFolds(requestEditor)
  })

  it("truncates status text > 13 chars with ellipsis", async () => {
    const { keymap, draft, eb } = createTestProps()
    const responseErr: SendState = {
      status: "done",
      response: {
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        body: '{"error":true}',
        timeMs: 456,
      },
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 100, height: 20, flexDirection: "column" }}>
            <RequestResponseView
              draft={
                draft as unknown as Parameters<
                  typeof RequestResponseView
                >[0]["draft"]
              }
              eb={
                eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]
              }
              error={null}
              focus="response"
              layout="stacked"
              expanded={null}
              activeEnv={null}
              responseState={responseErr}
              timelineEntries={[]}
              onResponseTabChange={() => {}}
              setSelectOpen={() => {}}
              urlbarSubFocus="text"
              urlbarInteractive={true}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("500 Internal Serv…")
  })

  it("does not render 'undefined' when expandHint or queryHint is omitted", async () => {
    const { keymap, draft, eb } = createTestProps()
    const responseOK: SendState = {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: '{"ok":true}',
        timeMs: 123,
      },
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 100, height: 20, flexDirection: "column" }}>
            <RequestResponseView
              draft={
                draft as unknown as Parameters<
                  typeof RequestResponseView
                >[0]["draft"]
              }
              eb={
                eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]
              }
              error={null}
              focus="response"
              layout="stacked"
              expanded={null}
              activeEnv={null}
              responseState={responseOK}
              timelineEntries={[]}
              onResponseTabChange={() => {}}
              setSelectOpen={() => {}}
              urlbarSubFocus="text"
              urlbarInteractive={true}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("undefined")
  })

  for (const [layout, width] of [
    ["stacked", 80],
    ["stacked", 160],
    ["side-by-side", 80],
    ["side-by-side", 160],
  ] as const) {
    it(`anchors jump badges to tabs in ${layout} layout at ${width} columns`, async () => {
      const { keymap, draft, eb } = createTestProps()
      const responseIdle: SendState = { status: "idle" }
      const { renderOnce, captureCharFrame } = await testRender(
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box style={{ width, height: 24, flexDirection: "column" }}>
              <RequestResponseView
                draft={
                  draft as unknown as Parameters<
                    typeof RequestResponseView
                  >[0]["draft"]
                }
                eb={
                  eb as unknown as Parameters<
                    typeof RequestResponseView
                  >[0]["eb"]
                }
                error={null}
                focus="response"
                layout={layout}
                expanded={null}
                activeEnv={null}
                responseState={responseIdle}
                timelineEntries={[]}
                onResponseTabChange={() => {}}
                setSelectOpen={() => {}}
                urlbarSubFocus="text"
                urlbarInteractive={true}
                jumpMode={true}
              />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width, height: 24 },
      )
      await renderOnce()

      const lines = captureCharFrame().split("\n")
      const expectBadge = (hint: string) => {
        expect(lines.some((l) => l.includes(` ${hint} `))).toBe(true)
      }
      expectBadge("h")
      expectBadge("p")
      expectBadge("x")
      if (layout !== "side-by-side" || width > 80) {
        expectBadge("b")
        expectBadge("a")
        expectBadge("t")
      }
      expectBadge("r")
      expectBadge("e")
      expectBadge("n")
      expectBadge("l")

      const expectBadgeAtTabStart = (hint: string, label: string) => {
        const badgeRow = lines.findIndex((line) => line.includes(` ${hint} `))
        expect(badgeRow).toBeGreaterThanOrEqual(0)
        const badgeStart = lines[badgeRow]!.indexOf(` ${hint} `)
        const labelStart = lines[badgeRow + 1]!.indexOf(label, badgeStart)
        expect(labelStart).toBe(badgeStart + 1)
      }

      if (layout === "stacked") {
        expectBadgeAtTabStart("h", "Headers")
        expectBadgeAtTabStart("p", "Params")
        expectBadgeAtTabStart("x", "Path")
        expectBadgeAtTabStart("b", "Body")
        expectBadgeAtTabStart("a", "Auth")
        expectBadgeAtTabStart("t", "Settings")
        expectBadgeAtTabStart("r", "Body")
        expectBadgeAtTabStart("e", "Headers")
        expectBadgeAtTabStart("n", "Network")
        expectBadgeAtTabStart("l", "Timeline")
      }
    })
  }

  it("hides urlbar m/u badges when expanded=response", async () => {
    const { keymap, draft, eb } = createTestProps()
    const responseIdle: SendState = { status: "idle" }
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 80, height: 24, flexDirection: "column" }}>
            <RequestResponseView
              draft={
                draft as unknown as Parameters<
                  typeof RequestResponseView
                >[0]["draft"]
              }
              eb={
                eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]
              }
              error={null}
              focus="response"
              layout="stacked"
              expanded="response"
              activeEnv={null}
              responseState={responseIdle}
              timelineEntries={[]}
              onResponseTabChange={() => {}}
              setSelectOpen={() => {}}
              urlbarSubFocus="text"
              urlbarInteractive={true}
              jumpMode={true}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain(" m ")
    expect(frame).not.toContain(" u ")
  })

  it("hides response badges when no request is selected", async () => {
    const { keymap, draft, eb } = createTestProps()
    const responseIdle: SendState = { status: "idle" }
    const { renderOnce, captureSpans } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 80, height: 24, flexDirection: "column" }}>
            <RequestResponseView
              draft={
                { ...draft, draft: null } as unknown as Parameters<
                  typeof RequestResponseView
                >[0]["draft"]
              }
              eb={
                eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]
              }
              error={null}
              focus="response"
              layout="stacked"
              expanded={null}
              activeEnv={null}
              responseState={responseIdle}
              timelineEntries={[]}
              onResponseTabChange={() => {}}
              setSelectOpen={() => {}}
              urlbarSubFocus="text"
              urlbarInteractive={true}
              jumpMode
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    for (const letter of ["r", "e", "n", "l"]) {
      expect(
        spans.some(
          (span) =>
            span.text === letter &&
            (span.attributes & TextAttributes.BOLD) !== 0,
        ),
      ).toBe(false)
    }
  })

  it("does not sync the previous URL when switching requests", async () => {
    const { keymap } = createTestProps()
    const syncedUrls: string[] = []
    let switchRequest = () => {}

    function RequestSwitchHarness() {
      const [selectedId, setSelectedId] = useState("first")
      const [focus, setFocus] = useState<"urlbar" | "sidebar">("urlbar")
      const draft = {
        draft: {
          id: selectedId,
          method: "GET" as const,
          url: `https://${selectedId}.example.com`,
          headers: {},
          params: [],
          auth: { type: "none" as const },
          bodyType: "json" as const,
        },
        setUrl: () => {},
        setMethod: () => {},
        syncUrlParams: (url: string) => syncedUrls.push(url),
        setAuthType: () => {},
        setApiKeyPlacement: () => {},
        setBodyType: () => {},
        dirtyRequestIds: new Set<string>(),
      }
      const eb = {
        editState: {
          mode: "inactive" as const,
          cursor: { field: "body" as const, row: 0, addingRow: false },
          editingRow: -1,
        },
        editKey: "",
        editValue: "",
        setEditKey: () => {},
        setEditValue: () => {},
        activeTab: "body" as const,
      }

      switchRequest = () => {
        setSelectedId("second")
        setFocus("sidebar")
      }

      return (
        <RequestResponseView
          draft={
            draft as unknown as Parameters<
              typeof RequestResponseView
            >[0]["draft"]
          }
          eb={eb as unknown as Parameters<typeof RequestResponseView>[0]["eb"]}
          error={null}
          focus={focus}
          layout="stacked"
          expanded={null}
          activeEnv={null}
          responseState={{ status: "idle" }}
          timelineEntries={[]}
          onResponseTabChange={() => {}}
          setSelectOpen={() => {}}
          urlbarSubFocus="text"
          urlbarInteractive={true}
        />
      )
    }

    const { renderOnce } = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box style={{ width: 100, height: 20, flexDirection: "column" }}>
            <RequestSwitchHarness />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )

    await renderOnce()
    act(() => {
      switchRequest()
    })
    await renderOnce()

    expect(syncedUrls).toEqual([])
  })
})

describe("getAvailableTargets", () => {
  it("exposes only the settings panes in settings view", () => {
    const targets = getAvailableTargets(false, null, false, false, true)
    expect([...targets.keys()]).toEqual(["s", "c"])
    expect(targets.get("s")).toEqual({ kind: "settings-sidebar" })
    expect(targets.get("c")).toEqual({ kind: "settings-content" })
  })

  it("returns sidebar and folder tabs in folder view", () => {
    const targets = getAvailableTargets(true, null, true)
    expect(targets.size).toBe(5)
    expect(targets.get("s")).toEqual({ kind: "sidebar" })
    expect(targets.get("m")).toEqual({ kind: "folder-tab", field: "meta" })
    expect(targets.get("h")).toEqual({ kind: "folder-tab", field: "headers" })
    expect(targets.get("a")).toEqual({ kind: "folder-tab", field: "auth" })
    expect(targets.get("y")).toEqual({ kind: "folder-tab", field: "activity" })
  })

  it("returns environment editor targets", () => {
    const targets = getAvailableTargets(false, null, false, true)
    expect(targets.size).toBe(4)
    expect(targets.get("s")).toEqual({ kind: "env-sidebar" })
    expect(targets.get("m")).toEqual({ kind: "env-name" })
    expect(targets.get("c")).toEqual({ kind: "env-color" })
    expect(targets.get("v")).toEqual({ kind: "env-vars" })
  })

  it("returns sidebar + urlbar + all request/response tabs when not expanded", () => {
    const targets = getAvailableTargets(true, null, false)
    expect(targets.has("s")).toBe(true)
    expect(targets.has("m")).toBe(true)
    expect(targets.has("u")).toBe(true)
    expect(targets.has("h")).toBe(true)
    expect(targets.has("p")).toBe(true)
    expect(targets.has("x")).toBe(true)
    expect(targets.has("b")).toBe(true)
    expect(targets.has("a")).toBe(true)
    expect(targets.has("t")).toBe(true)
    expect(targets.has("r")).toBe(true)
    expect(targets.has("e")).toBe(true)
    expect(targets.has("n")).toBe(true)
    expect(targets.has("l")).toBe(true)
    expect(targets.has("k")).toBe(true)
    expect(targets.has("v")).toBe(true)
    expect(targets.get("v")).toEqual({
      kind: "request-tab",
      field: "assertions",
    })
    expect(targets.get("c")).toEqual({
      kind: "request-tab",
      field: "captures",
    })
    expect(targets.has("i")).toBe(true)
    expect(targets.size).toBe(17)
  })

  it("keeps the Results jump target when no execution groups are available", () => {
    const targets = getAvailableTargets(true, null, false, false, false, false)
    expect(targets.has("i")).toBe(true)
    expect(targets.has("r")).toBe(true)
  })

  it("excludes response targets when expanded=request", () => {
    const targets = getAvailableTargets(true, "request", false)
    expect(targets.has("h")).toBe(true)
    expect(targets.has("b")).toBe(true)
    expect(targets.has("r")).toBe(false)
    expect(targets.has("e")).toBe(false)
    expect(targets.has("n")).toBe(false)
    expect(targets.has("l")).toBe(false)
    expect(targets.has("k")).toBe(false)
  })

  it("excludes request targets when expanded=response", () => {
    const targets = getAvailableTargets(true, "response", false)
    expect(targets.has("r")).toBe(true)
    expect(targets.has("e")).toBe(true)
    expect(targets.has("n")).toBe(true)
    expect(targets.has("l")).toBe(true)
    expect(targets.has("h")).toBe(false)
    expect(targets.has("b")).toBe(false)
  })

  it("excludes urlbar/request/response when hasRequest is false", () => {
    const targets = getAvailableTargets(false, null, false)
    expect(targets.size).toBe(1)
    expect(targets.get("s")).toEqual({ kind: "sidebar" })
  })
})

describe("computeRequestTabLabels", () => {
  it("returns base labels when request is null", () => {
    const labels = computeRequestTabLabels(null)
    expect(labels).toEqual({
      headers: "Headers",
      params: "Params",
      pathParams: "Path",
      body: "Body",
      auth: "Auth",
      assertions: "Assert",
      captures: "Capture",
      settings: "Settings",
    })
  })

  it("appends bullet when headers have enabled entries", () => {
    const labels = computeRequestTabLabels({
      headers: { "X-Foo": { value: "bar", enabled: true } },
      params: [],
      url: "",
      method: "GET",
      auth: { type: "none" },
      timeout: 0,
    } as unknown as import("../../src/schema").Request)
    expect(labels.headers).toBe("Headers \u2022")
    expect(labels.params).toBe("Params")
  })

  it("appends bullet when auth is set", () => {
    const labels = computeRequestTabLabels({
      headers: {},
      params: [],
      url: "",
      method: "GET",
      auth: { type: "bearer" },
      timeout: 0,
    } as unknown as import("../../src/schema").Request)
    expect(labels.auth).toBe("Auth \u2022")
  })

  it("appends bullet when body is set", () => {
    const labels = computeRequestTabLabels({
      headers: {},
      params: [],
      url: "",
      method: "GET",
      body: "hello",
      auth: { type: "none" },
      timeout: 0,
    } as unknown as import("../../src/schema").Request)
    expect(labels.body).toBe("Body \u2022")
  })

  it("appends bullet when timeout > 0", () => {
    const labels = computeRequestTabLabels({
      headers: {},
      params: [],
      url: "",
      method: "GET",
      auth: { type: "none" },
      timeout: 5000,
    } as unknown as import("../../src/schema").Request)
    expect(labels.settings).toBe("Settings \u2022")
  })

  it("marks assertion and capture tabs even when declarations are disabled", () => {
    const labels = computeRequestTabLabels({
      headers: {},
      params: [],
      url: "",
      method: "GET",
      timeout: 0,
      tags: ["smoke"],
      captures: { token: { value: "body.token", enabled: false } },
      assertions: [
        { expression: "status", operator: "exists", enabled: false },
      ],
    } as unknown as import("../../src/schema").Request)
    expect(labels.assertions).toBe("Assert \u2022")
    expect(labels.captures).toBe("Capture \u2022")
    expect(labels.settings).toBe("Settings \u2022")
  })
})
