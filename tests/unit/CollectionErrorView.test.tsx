import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { act, useState } from "react"
import { extend } from "@opentui/react"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scheduler } from "node:timers/promises"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import {
  CollectionErrorView,
  resolveCollectionErrorFile,
} from "../../src/ui/CollectionErrorView"
import { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"
import type { CollectionFileError } from "../../src/filestore/load"

extend({ "code-editor": CodeEditorRenderable })

const testRender = createTestRender()
let collectionDir: string

const errors: CollectionFileError[] = [
  {
    file: "first.yml",
    message: 'missing required field "url"',
    rawError: 'lang.parseRequest: missing required field "url"',
  },
  {
    file: "second.yml",
    message: '"timeout" must be a finite number',
    rawError: 'lang.parseRequest: "timeout" must be a finite number',
  },
]

async function settle(
  renderOnce: () => Promise<void>,
  captureCharFrame: () => string,
): Promise<void> {
  const deadline = Date.now() + 2_000
  await act(async () => {
    await renderOnce()
  })
  while (captureCharFrame().includes("Loading...")) {
    if (Date.now() >= deadline)
      throw new Error("Timed out loading collection error editor")
    await act(async () => {
      await scheduler.yield()
      await renderOnce()
    })
  }
}

beforeEach(async () => {
  collectionDir = await mkdtemp(join(tmpdir(), "noodle-errors-"))
  await writeFile(
    join(collectionDir, "first.yml"),
    "name: first\nmethod: GET\n",
  )
  await writeFile(
    join(collectionDir, "second.yml"),
    "name: second\nmethod: GET\nurl: https://example.com\ntimeout: nope\n",
  )
})

afterEach(async () => {
  await rm(collectionDir, { recursive: true, force: true })
})

describe("CollectionErrorView", () => {
  it("renders only error items on the left and the selected YAML on the right", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionErrorView
            collectionDir={collectionDir}
            errors={errors}
            focus="sidebar"
            activeEnv={null}
            onPaneFocus={() => {}}
            onSaved={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 28 },
    )
    await settle(renderOnce, captureCharFrame)

    const frame = captureCharFrame()
    const frameLines = frame.split("\n")
    const firstFileLine = frameLines.findIndex((line) =>
      line.includes("first.yml"),
    )
    const secondFileLine = frameLines.findIndex((line) =>
      line.includes("second.yml"),
    )
    const firstFileColumn = frameLines[firstFileLine]!.indexOf("first.yml")
    const secondFileColumn = frameLines[secondFileLine]!.indexOf("second.yml")
    expect(frame).toContain("Requests")
    expect(frame).toContain("ERR    first.yml")
    expect(frame).toContain("first.yml")
    expect(frame).toContain("second.yml")
    expect(secondFileLine - firstFileLine).toBe(1)
    expect(secondFileColumn).toBe(firstFileColumn)
    expect(frame).toContain("name: first")
    expect(frame).toContain("! Invalid request YAML for first.yml")
    expect(frame).not.toContain("lang.parseRequest:")
    expect(frame).not.toContain("Collection Errors")
    expect(frame).not.toContain("Problems")
    expect(frame).not.toContain("Collection needs attention")
    expect(frame).not.toContain("Select a problem")
    expect(frame).not.toContain("2 errors")
    cleanup()
  })

  it("renders only truncated filenames in the sidebar", async () => {
    const { keymap, cleanup } = setupKeymap()
    const longErrors: CollectionFileError[] = [
      {
        file: "a-very-long-request-filename-that-does-not-fit.yml",
        message:
          "this is a very long validation message that must stay inside the sidebar",
        rawError: "long error",
      },
    ]
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionErrorView
            collectionDir={collectionDir}
            errors={longErrors}
            focus="sidebar"
            activeEnv={null}
            onPaneFocus={() => {}}
            onSaved={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await settle(renderOnce, captureCharFrame)

    const frame = captureCharFrame()
    const sidebarFrame = frame.split("\n").slice(0, 3).join("\n")
    expect(sidebarFrame).toContain("...")
    expect(sidebarFrame).not.toContain(
      "a-very-long-request-filename-that-does-not-fit.yml",
    )
    expect(sidebarFrame).not.toContain(longErrors[0]!.message)
    cleanup()
  })

  it("selects error files with the keyboard", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionErrorView
            collectionDir={collectionDir}
            errors={errors}
            focus="sidebar"
            activeEnv={null}
            onPaneFocus={() => {}}
            onSaved={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 28 },
    )
    await settle(renderOnce, captureCharFrame)

    await act(async () => mockInput.pressKey("ARROW_DOWN"))
    await settle(renderOnce, captureCharFrame)
    expect(captureCharFrame()).toContain("name: second")
    cleanup()
  })

  it("selects error files with the mouse", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionErrorView
              collectionDir={collectionDir}
              errors={errors}
              focus="sidebar"
              activeEnv={null}
              onPaneFocus={() => {}}
              onSaved={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 28 },
      )
    await settle(renderOnce, captureCharFrame)

    const row = renderer.root.findDescendantById(
      "collection-error-1",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.click(row.screenX + 1, row.screenY, MouseButtons.LEFT)
    })
    await settle(renderOnce, captureCharFrame)
    expect(captureCharFrame()).toContain("name: second")
    cleanup()
  })

  it("tracks a dirty invalid draft until it is successfully saved", async () => {
    const { keymap, cleanup } = setupKeymap()
    let dirty = false
    let saved = 0
    let resolveSaved: (() => void) | undefined
    const savedPromise = new Promise<void>((resolve) => {
      resolveSaved = resolve
    })
    const saveActionRef: { current: (() => void) | null } = { current: null }
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionErrorView
            collectionDir={collectionDir}
            errors={errors.slice(0, 1)}
            focus="folder"
            activeEnv={null}
            onPaneFocus={() => {}}
            onDirtyChange={(value) => (dirty = value)}
            saveActionRef={saveActionRef}
            onSaved={() => {
              saved++
              resolveSaved?.()
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 28 },
    )
    await settle(renderOnce, captureCharFrame)

    const editor = renderer.root.findDescendantById(
      "collection-error-editor",
    ) as CodeEditorRenderable
    await act(async () => {
      editor.value = "name: first\nmethod: GET\nunknown: true\n"
      editor.onSourceChange?.()
    })
    await renderOnce()

    expect(dirty).toBe(true)
    expect(captureCharFrame()).toContain("●")
    expect(captureCharFrame()).toContain("! Invalid request YAML for first.yml")
    expect(captureCharFrame()).not.toContain("lang.parseRequest:")

    await act(async () => {
      saveActionRef.current?.()
    })
    await renderOnce()
    expect(dirty).toBe(true)
    expect(captureCharFrame()).not.toContain("Save error:")

    await act(async () => {
      editor.value = "name: first\nmethod: GET\nurl: https://example.com\n"
      editor.onSourceChange?.()
      saveActionRef.current?.()
      await savedPromise
    })
    await renderOnce()

    expect(saved).toBe(1)
    expect(dirty).toBe(false)
    expect(captureCharFrame()).not.toContain("●")
    cleanup()
  })

  it("keeps dirty drafts and markers when switching error files", async () => {
    using consoleError = spyOn(console, "error").mockImplementation(() => {})
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionErrorView
              collectionDir={collectionDir}
              errors={errors}
              focus="folder"
              activeEnv={null}
              onPaneFocus={() => {}}
              onSaved={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 28 },
      )
    await settle(renderOnce, captureCharFrame)

    const editor = renderer.root.findDescendantById(
      "collection-error-editor",
    ) as CodeEditorRenderable
    await act(async () => {
      editor.value = "name: first\nmethod: GET\nunknown: true\n"
      editor.onSourceChange?.()
    })
    await renderOnce()

    const secondRow = renderer.root.findDescendantById(
      "collection-error-1",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.click(
        secondRow.screenX + 1,
        secondRow.screenY,
        MouseButtons.LEFT,
      )
    })
    await settle(renderOnce, captureCharFrame)
    expect(captureCharFrame()).toContain("●")

    const firstRow = renderer.root.findDescendantById(
      "collection-error-0",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.click(
        firstRow.screenX + 1,
        firstRow.screenY,
        MouseButtons.LEFT,
      )
    })
    await settle(renderOnce, captureCharFrame)
    expect(consoleError).not.toHaveBeenCalled()
    expect(captureCharFrame()).toContain("unknown: true")
    cleanup()
  })

  it("keeps a dirty draft when refreshed errors recreate the selected item", async () => {
    const { keymap, cleanup } = setupKeymap()
    let refreshErrors = () => {}

    function Harness() {
      const [revision, setRevision] = useState(0)
      refreshErrors = () => setRevision((current) => current + 1)
      return (
        <CollectionErrorView
          collectionDir={collectionDir}
          errors={errors.slice(0, 1).map((error) => ({
            ...error,
            message: `${error.message} (${revision})`,
          }))}
          focus="folder"
          activeEnv={null}
          onPaneFocus={() => {}}
          onSaved={() => {}}
        />
      )
    }

    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 28 },
    )
    await settle(renderOnce, captureCharFrame)

    const editor = renderer.root.findDescendantById(
      "collection-error-editor",
    ) as CodeEditorRenderable
    await act(async () => {
      editor.value = "name: first\nmethod: GET\nunknown: true\n"
      editor.onSourceChange?.()
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("unknown: true")

    await act(async () => refreshErrors())
    await settle(renderOnce, captureCharFrame)

    expect(captureCharFrame()).toContain("unknown: true")
    cleanup()
  })

  it("does not intercept ctrl+s outside the configured command layer", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let saved = 0
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CollectionErrorView
            collectionDir={collectionDir}
            errors={errors.slice(0, 1)}
            focus="folder"
            activeEnv={null}
            onPaneFocus={() => {}}
            onSaved={() => saved++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 28 },
    )
    await settle(renderOnce, captureCharFrame)

    const editor = renderer.root.findDescendantById(
      "collection-error-editor",
    ) as CodeEditorRenderable
    await act(async () => {
      editor.value =
        "name: first\nmethod: GET\nurl: https://example.com\ntimeout: 10000\n"
    })
    await act(async () => {
      host.press("s", { ctrl: true })
    })

    expect(saved).toBe(0)
    cleanup()
  })

  it("activates the editor pane when the YAML content is clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    const focused: string[] = []
    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionErrorView
              collectionDir={collectionDir}
              errors={errors.slice(0, 1)}
              focus="sidebar"
              activeEnv={null}
              onPaneFocus={(next) => focused.push(next)}
              onSaved={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 28 },
      )
    await settle(renderOnce, captureCharFrame)

    const editor = renderer.root.findDescendantById(
      "collection-error-editor",
    ) as CodeEditorRenderable
    await act(async () => {
      await mockMouse.click(editor.x + 5, editor.y, MouseButtons.LEFT)
    })

    expect(focused).toContain("folder")
    cleanup()
  })
})

describe("resolveCollectionErrorFile", () => {
  it("rejects files outside the collection", () => {
    expect(
      resolveCollectionErrorFile(collectionDir, "../outside.yml"),
    ).toBeNull()
    expect(
      resolveCollectionErrorFile(collectionDir, "/tmp/outside.yml"),
    ).toBeNull()
    expect(resolveCollectionErrorFile(collectionDir, "collection")).toBeNull()
  })
})
