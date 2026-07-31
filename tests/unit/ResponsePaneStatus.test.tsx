import { describe, it, expect } from "bun:test"
import { extend } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { TextAttributes } from "@opentui/core"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { RequestResponseView } from "../../src/ui/RequestResponseView"
import { ThemeProvider } from "../../src/ui/theme"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import type { SendState } from "../../src/ui/sendState"
import {
  getAvailableTargets,
  computeRequestTabLabels,
} from "../../src/ui/useJumpMode"

extend({ "code-editor": CodeEditorRenderable })

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
    for (const letter of ["r", "e", "l"]) {
      expect(
        spans.some(
          (span) =>
            span.text === letter &&
            (span.attributes & TextAttributes.BOLD) !== 0,
        ),
      ).toBe(false)
    }
  })
})

describe("getAvailableTargets", () => {
  it("returns only sidebar in folder view", () => {
    const targets = getAvailableTargets(true, null, true)
    expect(targets.size).toBe(1)
    expect(targets.get("s")).toEqual({ kind: "sidebar" })
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
    expect(targets.has("l")).toBe(true)
    expect(targets.size).toBe(12)
  })

  it("excludes response targets when expanded=request", () => {
    const targets = getAvailableTargets(true, "request", false)
    expect(targets.has("h")).toBe(true)
    expect(targets.has("b")).toBe(true)
    expect(targets.has("r")).toBe(false)
    expect(targets.has("e")).toBe(false)
    expect(targets.has("l")).toBe(false)
  })

  it("excludes request targets when expanded=response", () => {
    const targets = getAvailableTargets(true, "response", false)
    expect(targets.has("r")).toBe(true)
    expect(targets.has("e")).toBe(true)
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
    expect(labels).toEqual([
      "Headers",
      "Params",
      "Path",
      "Body",
      "Auth",
      "Settings",
    ])
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
    expect(labels[0]).toBe("Headers \u2022")
    expect(labels[1]).toBe("Params")
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
    expect(labels[4]).toBe("Auth \u2022")
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
    expect(labels[3]).toBe("Body \u2022")
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
    expect(labels[5]).toBe("Settings \u2022")
  })
})
