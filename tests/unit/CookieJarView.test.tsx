import { describe, expect, it } from "bun:test"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { CookieJarSidebar } from "../../src/ui/cookie-jar/CookieJarSidebar"
import { useCookieJarView } from "../../src/hooks/useCookieJarView"
import {
  CookieJarStorageError,
  type CollectionCookieJar,
  type JarCookie,
} from "../../src/cookies"
import { CookieJarView } from "../../src/ui/cookie-jar/CookieJarView"
import { act, useRef } from "react"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import type { Focus } from "../../src/ui/focus"
import { setupKeymap } from "./_helpers"
import { FullBorder } from "../../src/ui/borders"

const testRender = createTestRender()

function jarWith(cookies: JarCookie[]): CollectionCookieJar {
  return {
    list: () => cookies,
    subscribe: () => () => {},
    deleteCookie: async () => {},
    deleteDomain: async () => {},
    clear: async () => {},
  } as unknown as CollectionCookieJar
}

function observableJar(initial: JarCookie[]) {
  let cookies = initial
  let listener: (() => void) | undefined
  return {
    jar: {
      list: () => cookies,
      subscribe: (next: () => void) => {
        listener = next
        return () => {
          if (listener === next) listener = undefined
        }
      },
      deleteCookie: async () => {},
      deleteDomain: async () => {},
      clear: async () => {},
    } as unknown as CollectionCookieJar,
    add(cookie: JarCookie) {
      cookies = [...cookies, cookie]
      listener?.()
    },
  }
}

const twoCookies = jarWith([
  {
    name: "session",
    value: "abc",
    domain: "example.com",
    path: "/",
    expires: null,
    secure: true,
    httpOnly: true,
    hostOnly: false,
  },
  {
    name: "scoped",
    value: "yes",
    domain: "example.com",
    path: "/admin",
    expires: new Date(Date.now() + 86400000),
    secure: false,
    httpOnly: false,
    hostOnly: false,
    sameSite: "lax",
  },
])

function Harness({
  jar,
  onReady,
  onAddCookie,
  focus = "cookie-sidebar",
  onPaneFocus,
}: {
  jar: CollectionCookieJar
  onReady?: (v: ReturnType<typeof useCookieJarView>) => void
  onAddCookie?: () => void
  focus?: Focus
  onPaneFocus?: (focus: Focus) => void
}) {
  const view = useCookieJarView(jar)
  const ref = useRef(onReady)
  ref.current = onReady
  useRef(view)
  if (ref.current) ref.current(view)
  return (
    <CookieJarView
      view={view}
      status={{ state: "encrypted" }}
      focus={focus}
      onAddCookie={onAddCookie}
      onPaneFocus={onPaneFocus}
    />
  )
}

describe("CookieJarView", () => {
  it("renders domains and cookie rows", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness jar={twoCookies} />
      </ThemeProvider>,
      { width: 140, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("example.com")
    expect(frame).toContain("session")
    expect(frame).toContain("scoped")
    expect(frame).toContain("COOKIE")
    expect(frame).not.toContain("Cookie Jar")
    expect(frame.match(/example\.com/g)).toHaveLength(1)
  })

  it("does not show cookie counts beside sidebar domains", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CookieJarSidebar
          domains={[{ domain: "example.com", count: 42 }]}
          selectedDomain="example.com"
          domainIndex={0}
          focused
          onSelectDomain={() => {}}
        />
      </ThemeProvider>,
      { width: 50, height: 8 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("example.com")
    expect(frame).not.toContain("42")
  })

  it("leaves a space between the domain left bar and its label", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CookieJarSidebar
          domains={[{ domain: "example.com", count: 1 }]}
          selectedDomain="example.com"
          domainIndex={0}
          focused
          onSelectDomain={() => {}}
        />
      </ThemeProvider>,
      { width: 50, height: 8 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("┃ example.com")
  })

  it("uses the response cookie accordion layout and expands details", async () => {
    let view: ReturnType<typeof useCookieJarView> | undefined
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness jar={twoCookies} onReady={(next) => (view = next)} />
      </ThemeProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()

    expect(captureCharFrame()).toContain("▸ COOKIE")
    act(() => view!.toggleCookieExpanded())
    await renderOnce()

    const expanded = captureCharFrame()
    expect(expanded).toContain("▾ COOKIE")
    expect(expanded).toContain("Value")
    expect(expanded).toContain("Domain")
    expect(expanded).toContain("Path")
    expect(expanded).toContain("Expires")
    expect(expanded).toContain("Flags")
    expect(expanded).toContain("Domain")
  })

  it("resets the expanded cookie when filtering changes the cookie list", async () => {
    let view: ReturnType<typeof useCookieJarView> | undefined
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness jar={twoCookies} onReady={(next) => (view = next)} />
      </ThemeProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()

    act(() => view!.toggleCookieExpanded())
    await renderOnce()
    expect(view!.expandedCookieIndex).toBe(0)

    act(() => view!.setFilter("scoped"))
    await renderOnce()
    expect(view!.expandedCookieIndex).toBeNull()
  })

  it("resets the expanded cookie when switching domains", async () => {
    let view: ReturnType<typeof useCookieJarView> | undefined
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          jar={jarWith([
            {
              name: "first",
              value: "one",
              domain: "a.example.com",
              path: "/",
              expires: null,
              secure: false,
              httpOnly: false,
              hostOnly: true,
            },
            {
              name: "second",
              value: "two",
              domain: "b.example.com",
              path: "/",
              expires: null,
              secure: false,
              httpOnly: false,
              hostOnly: true,
            },
          ])}
          onReady={(next) => (view = next)}
        />
      </ThemeProvider>,
      { width: 100, height: 20 },
    )
    await renderOnce()

    act(() => view!.toggleCookieExpanded())
    await renderOnce()
    expect(view!.expandedCookieIndex).toBe(0)

    act(() => view!.selectDomain("b.example.com"))
    await renderOnce()
    expect(view!.selectedDomain).toBe("b.example.com")
    expect(view!.expandedCookieIndex).toBeNull()
  })

  it("wraps long cookie values and toggles expansion with a mouse click", async () => {
    let paneFocused = false
    const longValue = `prefix-${"x".repeat(90)}-tail`
    const { renderer, renderOnce, captureCharFrame, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness
            jar={jarWith([
              {
                name: "session",
                value: longValue,
                domain: "example.com",
                path: "/",
                expires: null,
                secure: true,
                httpOnly: true,
                hostOnly: false,
                sameSite: "strict",
              },
            ])}
            focus="cookie-list"
            onPaneFocus={() => {
              paneFocused = true
            }}
          />
        </ThemeProvider>,
        { width: 100, height: 24 },
      )
    await renderOnce()

    const row = renderer.root.findDescendantById("cookie-row-0")
    expect(row).toBeDefined()
    const x = row!.screenX + 3
    const y = row!.screenY
    await act(async () => mockMouse.click(x, y, MouseButtons.LEFT))
    await renderOnce()

    const frame = captureCharFrame()
    expect(paneFocused).toBe(true)
    expect(frame).toContain("▾ COOKIE")
    expect(frame).toContain("Value")
    expect(frame).toContain("tail")
    expect(frame).toContain(
      "Flags    Secure · HttpOnly · SameSite=strict · Domain",
    )
  })

  it("groups cookies by domain and selects first", async () => {
    let view: ReturnType<typeof useCookieJarView> | undefined
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness jar={twoCookies} onReady={(v) => (view = v)} />
      </ThemeProvider>,
      { width: 100, height: 10 },
    )
    await renderOnce()
    expect(view!.domains).toEqual([{ domain: "example.com", count: 2 }])
    expect(view!.selectedDomain).toBe("example.com")
    expect(view!.cookies).toHaveLength(2)
  })

  it("sorts domains alphabetically", async () => {
    let view: ReturnType<typeof useCookieJarView> | undefined
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          jar={jarWith([
            {
              name: "a",
              value: "1",
              domain: "z.com",
              path: "/",
              expires: null,
              secure: false,
              httpOnly: false,
              hostOnly: false,
            },
            {
              name: "b",
              value: "2",
              domain: "a.com",
              path: "/",
              expires: null,
              secure: false,
              httpOnly: false,
              hostOnly: false,
            },
          ])}
          onReady={(v) => (view = v)}
        />
      </ThemeProvider>,
      { width: 100, height: 10 },
    )
    await renderOnce()
    expect(view!.domains.map((d) => d.domain)).toEqual(["a.com", "z.com"])
  })

  it("renders the empty jar sidebar state", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CookieJarSidebar
          domains={[]}
          selectedDomain={null}
          domainIndex={0}
          focused
          onSelectDomain={() => {}}
        />
      </ThemeProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("(no cookies)")
  })

  it("renders the no-domain pane state", async () => {
    const { keymap, cleanup } = setupKeymap()
    let addCookieCalls = 0
    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness jar={jarWith([])} onAddCookie={() => addCookieCalls++} />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Add a cookie")
    expect(frame).toContain("No cookies in this collection")
    expect(frame).not.toContain("Select a domain")
    expect(
      renderer.root.findDescendantById("empty-state-title"),
    ).toBeUndefined()
    const emptyState = renderer.root.findDescendantById(
      "empty-state",
    ) as BoxRenderable
    expect(emptyState.border).toEqual([...FullBorder.border])
    expect(frame).toContain("┌")
    expect(addCookieCalls).toBe(0)

    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.click(
        action.screenX + Math.floor(action.width / 2),
        action.screenY,
        MouseButtons.LEFT,
      )
    })
    expect(addCookieCalls).toBe(1)
    cleanup()
  })

  it("refreshes when the jar changes outside the cookie view", async () => {
    const source = observableJar([])
    let view: ReturnType<typeof useCookieJarView> | undefined
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness jar={source.jar} onReady={(next) => (view = next)} />
      </ThemeProvider>,
      { width: 100, height: 8 },
    )
    await renderOnce()
    expect(view!.domains).toEqual([])

    act(() =>
      source.add({
        name: "session",
        value: "abc",
        domain: "example.com",
        path: "/",
        expires: null,
        secure: false,
        httpOnly: false,
        hostOnly: false,
      }),
    )
    await renderOnce()

    expect(view!.domains).toEqual([{ domain: "example.com", count: 1 }])
  })

  it("shows complete unavailable diagnostics and recovery actions", async () => {
    const jar = jarWith([])
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CookieJarView
          view={{
            jar,
            domains: [],
            cookies: [],
            selectedDomain: null,
            domainIndex: 0,
            cookieIndex: 0,
            expandedCookieIndex: null,
            filter: "",
            filtering: false,
            refresh: () => {},
            selectDomain: () => {},
            domainUp: () => {},
            domainDown: () => {},
            cookieUp: () => {},
            cookieDown: () => {},
            selectCookie: () => {},
            toggleCookieExpanded: () => {},
            setFilter: () => {},
            setFiltering: () => {},
            deleteSelectedCookie: () => {},
            deleteSelectedDomain: () => {},
            clearAll: () => {},
          }}
          status={{
            state: "unavailable",
            error: new CookieJarStorageError(
              "malformed",
              "Cookie storage is malformed.",
              "/tmp/cookies/demo.json",
            ),
          }}
          focus="cookie-list"
          resetKey="^shift+x"
        />
      </ThemeProvider>,
      { width: 120, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("cookies unavailable")
    expect(frame).toContain("Cookie storage is malformed")
    expect(frame).toContain("malformed · /tmp/cookies/demo.json")
    expect(frame).toContain("Retry (r)")
    expect(frame).toContain("Reset with backup (^shift+x)")
  })
})
