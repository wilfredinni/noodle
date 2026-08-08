import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { act, useEffect, useState, type ReactNode } from "react"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { setupKeymap } from "./_helpers"
import { useTreeNavigation } from "../../src/hooks/useTreeNavigation"
import { getEditRequestYamlFile } from "../../src/ui/commandActions"
import type { CollectionItem } from "../../src/schema"

const testRender = createTestRender()

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
    revealFolder: (path: string) => void,
    selectedIdRef: { current: string | null },
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
    selectedIdRef,
    setSelectedId,
    expandFolder,
    revealRequest,
    revealFolder,
    cursorIndex,
  } = useTreeNavigation(items, () => true, initialSelectedId)

  useEffect(() => {
    afterMount?.(
      setSelectedId,
      setItems,
      expandFolder,
      revealRequest,
      revealFolder,
      selectedIdRef,
    )
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
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

  it("updates the YAML command target before navigation re-renders", async () => {
    const items = [req("first"), req("second")]
    let yamlTarget = ""

    const { renderOnce } = await render(
      <Harness
        initialItems={items}
        afterMount={(
          setSelectedId,
          _setItems,
          _expandFolder,
          _revealRequest,
          _revealFolder,
          selectedIdRef,
        ) => {
          setSelectedId("second")
          yamlTarget =
            getEditRequestYamlFile({
              collectionDir: "/tmp/collection",
              collectionRef: {
                current: { id: "collection", name: "collection", items },
              },
              selectedIdRef,
              focusedFolderPathRef: { current: null },
              focusRef: { current: "sidebar" },
            } as never)?.requestId ?? ""
        }}
      />,
    )

    await renderOnce()

    expect(yamlTarget).toBe("second")
  })

  it("reveals a request inside collapsed ancestor folders", async () => {
    const items = [
      req("root/list"),
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("s:users/admin/list")
    // Finder selection must reveal both collapsed ancestors and move the
    // sidebar cursor to the selected request.
    expect(frame).toContain("c:3")
  })

  it("reveals a folder inside collapsed ancestor folders and positions cursor on folder node", async () => {
    const items = [
      req("root/list"),
      fld("users", [fld("users/admin", [req("users/admin/list")])]),
    ]
    const { renderOnce, captureCharFrame } = await render(
      <Harness
        initialItems={items}
        afterMount={(
          _setSelectedId,
          _setItems,
          _expandFolder,
          _revealRequest,
          revealFolder,
        ) => {
          setTimeout(() => revealFolder("users/admin"), 5)
        }}
      />,
    )

    await renderOnce()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await renderOnce()
    const frame = captureCharFrame()

    // Cursor position should land on users/admin folder (index 2: root/list=0, users=1, users/admin=2)
    expect(frame).toContain("c:2")
  })
})
