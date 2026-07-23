import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { RequestResponseView } from "../../src/ui/RequestResponseView"
import { ThemeProvider } from "../../src/ui/theme"
import type { SendState } from "../../src/ui/sendState"

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

  it("renders jump mode key badges (R, E, L) on response pane tabs when jumpMode is true", async () => {
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
              jumpMode={true}
              jumpBadgeKeys={
                new Set(["r", "e", "l", "h", "p", "b", "a", "t", "s", "m", "u"])
              }
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("R")
    expect(frame).toContain("E")
    expect(frame).toContain("L")
  })
})
