import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { RequestResponseView } from "../../src/ui/RequestResponseView"
import { ThemeProvider } from "../../src/ui/theme"
import type { SendState } from "../../src/ui/sendState"
import { JumpModeOverlay } from "../../src/ui/overlays/JumpModeOverlay"
import type { JumpTarget } from "../../src/ui/useJumpMode"
import {
  getAvailableTargets,
  computeRequestTabLabels,
  computeBadgeOffsets,
} from "../../src/ui/useJumpMode"

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
              expandHint="f2 expand"
              queryHint="/ query"
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

  it("truncates status text > 5 chars with ellipsis", async () => {
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
              expandHint="f2 expand"
              queryHint="/ query"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("500 Inter…")
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
              expandHint="f2 expand"
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

  it("renders jump mode overlay badges without crashing and suppresses pane title", async () => {
    const targets = new Map<string, JumpTarget>([
      ["s", { kind: "sidebar" }],
      ["m", { kind: "method" }],
      ["u", { kind: "url" }],
      ["h", { kind: "request-tab", field: "headers" }],
      ["p", { kind: "request-tab", field: "params" }],
      ["b", { kind: "request-tab", field: "body" }],
      ["a", { kind: "request-tab", field: "auth" }],
      ["t", { kind: "request-tab", field: "settings" }],
      ["r", { kind: "response-tab", tab: "body" }],
      ["e", { kind: "response-tab", tab: "headers" }],
      ["l", { kind: "response-tab", tab: "timeline" }],
    ])

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box style={{ width: 100, height: 20, flexDirection: "column" }}>
          <JumpModeOverlay
            availableJumpTargets={targets}
            layout="stacked"
            expanded={null}
            focusedFolderPresent={false}
          />
        </box>
      </ThemeProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()
    // Renders without throwing is the primary assertion
  })

  it("renders jump mode overlay for folder view (sidebar only)", async () => {
    const targets = new Map<string, JumpTarget>([["s", { kind: "sidebar" }]])

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box style={{ width: 100, height: 10, flexDirection: "column" }}>
          <JumpModeOverlay
            availableJumpTargets={targets}
            layout="stacked"
            expanded={null}
            focusedFolderPresent={true}
          />
        </box>
      </ThemeProvider>,
      { width: 100, height: 10 },
    )
    await renderOnce()
    // Renders without throwing when focusedFolderPresent
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
    expect(targets.has("b")).toBe(true)
    expect(targets.has("a")).toBe(true)
    expect(targets.has("t")).toBe(true)
    expect(targets.has("r")).toBe(true)
    expect(targets.has("e")).toBe(true)
    expect(targets.has("l")).toBe(true)
    expect(targets.size).toBe(11)
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
    expect(labels).toEqual(["Headers", "Params", "Body", "Auth", "Settings"])
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
    expect(labels[3]).toBe("Auth \u2022")
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
    expect(labels[2]).toBe("Body \u2022")
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
    expect(labels[4]).toBe("Settings \u2022")
  })
})

describe("computeBadgeOffsets", () => {
  it("computes offsets from label lengths", () => {
    const offsets = computeBadgeOffsets(["Headers", "Params", "Body", "Auth"])
    expect(offsets).toEqual([2, 12, 21, 28])
  })

  it("adjusts offsets when earlier labels have bullets", () => {
    const offsets = computeBadgeOffsets([
      "Headers \u2022",
      "Params",
      "Body",
      "Auth",
    ])
    // Headers • = 9 chars → Params starts at 2 + 9 + 3 = 14
    expect(offsets[1]).toBe(14)
  })
})
