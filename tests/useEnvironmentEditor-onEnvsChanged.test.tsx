import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act, useEffect, useRef } from "react"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ThemeProvider } from "../src/ui/theme"
import { useEnvironmentEditor } from "../src/hooks/useEnvironmentEditor"
import { env } from "../src/env"

let dir: string

function Harness({
  onEnvsChanged: onChanged,
  onEnvDataChanged,
  editorRef,
}: {
  onEnvsChanged: () => void
  onEnvDataChanged?: () => void
  editorRef: { current: ReturnType<typeof useEnvironmentEditor> | null }
}) {
  const editor = useEnvironmentEditor({
    environmentsDir: dir,
    envNames: ["alpha", "beta", "gamma"],
    activeEnvName: "alpha",
    onEnvsChanged: onChanged,
    onActiveEnvChanged: () => {},
    onEnvDataChanged,
  })

  editorRef.current = editor

  const readyCalled = useRef(false)
  useEffect(() => {
    if (!readyCalled.current) {
      readyCalled.current = true
      editor.openEditor("alpha")
    }
  }, [editor])

  return <box />
}

describe("useEnvironmentEditor onEnvsChanged callback", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-onEnvsChanged-"))
    await env.saveEnvironment(dir, { name: "alpha", vars: { key: "val" } })
    await env.saveEnvironment(dir, { name: "beta", vars: { key: "val" } })
    await env.saveEnvironment(dir, { name: "gamma", vars: { key: "val" } })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("calls onEnvsChanged after cloneEnv", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    await ref.current!.cloneEnv("alpha-copy")
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("calls onEnvsChanged after deleteEnv", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    await ref.current!.deleteEnv()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("activates existing and new variable rows for editing", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 30))

    act(() => {
      ref.current!.activateVar(0)
    })
    await renderOnce()
    expect(ref.current!.editKey).toBe("key")
    expect(ref.current!.editValue).toBe("val")
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      row: 0,
      addingRow: false,
      subfield: "key",
    })

    act(() => {
      ref.current!.activateVar(0, false, "value")
    })
    await renderOnce()
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      row: 0,
      addingRow: false,
      subfield: "value",
    })

    act(() => {
      ref.current!.activateVar(-1, true)
    })
    await renderOnce()
    expect(ref.current!.editKey).toBe("")
    expect(ref.current!.editValue).toBe("")
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      row: -1,
      addingRow: true,
      subfield: "key",
    })
  })

  it("commits the active variable before activating another row", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 30))

    act(() => {
      ref.current!.activateVar(0)
      ref.current!.setEditKey("updated")
      ref.current!.setEditValue("value")
    })
    await renderOnce()

    act(() => {
      ref.current!.activateVar(-1, true)
    })
    await renderOnce()

    expect(ref.current!.draft?.varRows[0]).toMatchObject({
      key: "updated",
      value: "value",
    })
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      addingRow: true,
    })
  })

  it("keeps the selected variable after committing a deletion above it", async () => {
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: { first: "one", second: "two" },
    })
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 30))

    act(() => {
      ref.current!.activateVar(0)
      ref.current!.setEditKey("")
    })
    await renderOnce()

    act(() => {
      ref.current!.activateVar(1)
    })
    await renderOnce()

    expect(ref.current!.draft?.varRows).toHaveLength(1)
    expect(ref.current!.editKey).toBe("second")
    expect(ref.current!.editValue).toBe("two")
    expect(ref.current!.editState).toMatchObject({ row: 0, editingRow: 0 })
  })

  it("delete env removes file from disk", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    const filePath = join(dir, "alpha.env")
    const before = await readFile(filePath, "utf8")
      .then(() => true)
      .catch(() => false)
    expect(before).toBe(true)

    await ref.current!.deleteEnv()
    await new Promise((r) => setTimeout(r, 30))

    const after = await readFile(filePath, "utf8")
      .then(() => true)
      .catch(() => false)
    expect(after).toBe(false)
  })

  it("calls onEnvsChanged after save with rename", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    // Change name to trigger rename path
    ref.current!.setName("alpha-renamed")
    await ref.current!.save()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("calls onEnvDataChanged after save with same name (color edit)", async () => {
    const dataSpy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          onEnvsChanged={() => {}}
          onEnvDataChanged={dataSpy}
          editorRef={ref}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    // Edit without changing name (simulates color/vars edit)
    ref.current!.setColor("warning")
    await ref.current!.save()
    expect(dataSpy).toHaveBeenCalledTimes(1)
  })

  it("rejects rename to an existing env name", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    // snapshot original beta content before test
    const betaBefore = await readFile(join(dir, "beta.env"), "utf8")

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    // Rename "alpha" -> "beta" (beta already exists)
    ref.current!.setName("beta")
    await ref.current!.save()
    // flush React state update from setError
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()

    const editor = ref.current!
    expect(editor.error).not.toBeNull()
    expect(editor.error).toContain("already exists")

    // onEnvsChanged must NOT be called (save didn't succeed)
    expect(spy).not.toHaveBeenCalled()

    // beta file on disk must be unchanged
    const betaAfter = await readFile(join(dir, "beta.env"), "utf8")
    expect(betaAfter).toBe(betaBefore)
  })

  it("adds new name to envNames when saving a brand new env", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 30))

    // Close current editor, open new blank one
    ref.current!.closeEditor()
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()

    ref.current!.openEditor() // no name = blank draft (sync in else branch)
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()

    ref.current!.setName("new-env")
    await renderOnce()

    ref.current!.enterBrowse()
    await renderOnce()

    ref.current!.enterEdit()
    await renderOnce()

    ref.current!.setEditKey("key")
    ref.current!.setEditValue("value")
    await renderOnce()

    ref.current!.commitEdit()
    await renderOnce()

    console.log("draft before save:", JSON.stringify(ref.current!.draft))
    console.log("dirty:", ref.current!.dirty)

    await ref.current!.save()
    // flush setLocalNames state update
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()

    const editor = ref.current!
    expect(editor.error).toBeNull()
    expect(spy).toHaveBeenCalled()
    expect(editor.envNames).toContain("new-env")
  })

  it("navigates to first and last row using browseFirst and browseLast", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await new Promise((r) => setTimeout(r, 50))
    await renderOnce()

    ref.current!.enterBrowse()
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()

    expect(ref.current!.editState.mode).toBe("browsing")

    // Go to last item (add row)
    ref.current!.browseLast()
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()
    expect(ref.current!.editState.addingRow).toBe(true)

    // Go to first item (row 0)
    ref.current!.browseFirst()
    await new Promise((r) => setTimeout(r, 10))
    await renderOnce()
    expect(ref.current!.editState.row).toBe(0)
    expect(ref.current!.editState.addingRow).toBe(false)
  })
})
