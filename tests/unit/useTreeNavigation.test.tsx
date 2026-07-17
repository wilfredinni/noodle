import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { useEffect, useState, type ReactNode } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { setupKeymap } from "./_helpers"
import { useTreeNavigation } from "../../src/hooks/useTreeNavigation"
import type { CollectionItem } from "../../src/schema"

function req(id: string): CollectionItem {
  return {
    type: "request" as const,
    data: {
      id,
      name: id,
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" as const },
    },
  }
}

function fld(path: string, children: CollectionItem[]): CollectionItem {
  const id = path.split("/").pop()!
  return {
    type: "folder" as const,
    data: { id, name: id, path, children },
  }
}

interface Props {
  initialSelectedId?: string
  initialItems: CollectionItem[]
  afterMount?: (
    setSelectedId: (id: string) => void,
    setItems: (items: CollectionItem[]) => void,
    expandFolder: (path: string) => void,
    revealRequest: (id: string) => void,
  ) => void
}

function Harness({
  initialSelectedId,
  initialItems,
  afterMount,
}: Props): ReactNode {
  const [items, setItems] = useState(initialItems)
  const {
    selectedId,
    setSelectedId,
    expandFolder,
    revealRequest,
    cursorIndex,
  } = useTreeNavigation(items, () => true, initialSelectedId)

  useEffect(() => {
    afterMount?.(setSelectedId, setItems, expandFolder, revealRequest)
  }, [])

  return <text>{`s:${selectedId ?? ""}|c:${cursorIndex}`}</text>
}

describe("useTreeNavigation", () => {
  let keyCleanup: (() => void) | undefined

  beforeEach(() => {
    keyCleanup = undefined
  })

  afterEach(() => {
    keyCleanup?.()
  })

  function render(element: ReactNode) {
    const { keymap, cleanup } = setupKeymap()
    keyCleanup = cleanup
    return testRender(
      <KeymapProvider keymap={keymap}>{element}</KeymapProvider>,
      { width: 80, height: 10 },
    )
  }

  it("selects new request when initialSelectedId is a folder path", async () => {
    const items1 = [fld("users", [])]
    const items2 = [fld("users", [req("users/list")])]

    const { renderOnce, captureCharFrame } = await render(
      <Harness
        initialSelectedId="users/"
        initialItems={items1}
        afterMount={(setSelectedId, setItems, expandFolder) => {
          setTimeout(() => {
            expandFolder("users")
            setSelectedId("users/list")
            setItems(items2)
          }, 5)
        }}
      />,
    )

    await renderOnce()
    await renderOnce()

    // Wait for the create flow to complete
    await new Promise((r) => setTimeout(r, 30))
    await renderOnce()
    const frame = captureCharFrame()

    // selectedId should be "users/list" (not null) and cursor should
    // point to the request (not the folder)
    expect(frame).toContain("s:users/list")
    expect(frame).toContain("c:1")
  })

  it("keeps folder cursor when initialSelectedId is a folder and no request selected", async () => {
    const items = [fld("users", [])]

    const { renderOnce, captureCharFrame } = await render(
      <Harness initialSelectedId="users/" initialItems={items} />,
    )

    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()

    // No request selected, cursor should be at folder index (0)
    expect(frame).toContain("s:")
    expect(frame).toContain("c:0")
  })

  it("selects request from initialSelectedId when it names a request", async () => {
    const items = [fld("users", [req("users/list")])]

    const { renderOnce, captureCharFrame } = await render(
      <Harness initialSelectedId="users/list" initialItems={items} />,
    )

    await renderOnce()
    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("s:users/list")
    expect(frame).toContain("c:1")
  })

  it("reveals a request inside collapsed ancestor folders", async () => {
    const items = [
      fld("users", [fld("users/admin", [req("users/admin/list")])]),
    ]
    const { renderOnce, captureCharFrame } = await render(
      <Harness
        initialItems={items}
        afterMount={(
          _setSelectedId,
          _setItems,
          _expandFolder,
          revealRequest,
        ) => {
          setTimeout(() => revealRequest("users/admin/list"), 5)
        }}
      />,
    )

    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("s:users/admin/list")
    expect(frame).toContain("c:2")
  })
})
