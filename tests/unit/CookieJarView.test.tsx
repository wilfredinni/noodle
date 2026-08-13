import { describe, expect, it } from "bun:test"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { CookieJarSidebar } from "../../src/ui/cookie-jar/CookieJarSidebar"
import { useCookieJarView } from "../../src/hooks/useCookieJarView"
import type { CollectionCookieJar, JarCookie } from "../../src/cookies"
import { CookieJarView } from "../../src/ui/cookie-jar/CookieJarView"
import { useRef } from "react"

const testRender = createTestRender()

function jarWith(cookies: JarCookie[]): CollectionCookieJar {
  return {
    list: () => cookies,
    deleteCookie: async () => {},
    deleteDomain: async () => {},
    clear: async () => {},
  } as unknown as CollectionCookieJar
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
  },
  {
    name: "scoped",
    value: "yes",
    domain: "example.com",
    path: "/admin",
    expires: new Date(Date.now() + 86400000),
    secure: false,
    httpOnly: false,
    sameSite: "lax",
  },
])

function Harness({
  jar,
  onReady,
}: {
  jar: CollectionCookieJar
  onReady?: (v: ReturnType<typeof useCookieJarView>) => void
}) {
  const view = useCookieJarView(jar)
  const ref = useRef(onReady)
  ref.current = onReady
  useRef(view)
  if (ref.current) ref.current(view)
  return (
    <CookieJarView view={view} focus="cookie-sidebar" onPaneFocus={() => {}} />
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
    expect(frame).toContain("HttpOnly")
    expect(frame).toContain("session")
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
            },
            {
              name: "b",
              value: "2",
              domain: "a.com",
              path: "/",
              expires: null,
              secure: false,
              httpOnly: false,
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
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness jar={jarWith([])} />
      </ThemeProvider>,
      { width: 100, height: 6 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Select a domain")
  })
})
