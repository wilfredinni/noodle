import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { RequestResponseView } from "../../src/ui/RequestResponseView"
import { ThemeProvider } from "../../src/ui/theme"
import type { SendState } from "../../src/ui/sendState"

describe("ResponsePane status text truncation and layout tests", () => {
  it("renders short status text unchanged and truncates status text > 5 chars with ellipsis", async () => {
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

    // Test 1: Short statusText "OK" (<= 5 chars)
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
    {
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
    }

    // Test 2: Long statusText "Internal Server Error" (> 5 chars) -> "Inter…"
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
    {
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
                  eb as unknown as Parameters<
                    typeof RequestResponseView
                  >[0]["eb"]
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
    }
  })
})
