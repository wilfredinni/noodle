import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { useEffect, useRef } from "react"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ThemeProvider } from "../src/ui/theme"
import { useEnvironmentEditor } from "../src/ui/useEnvironmentEditor"
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

    ref.current!.addVar()
    await renderOnce()

    ref.current!.updateVarKey(0, "key")
    ref.current!.updateVarValue(0, "value")
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
})
