import { describe, it, expect } from "bun:test"
import { createTestRender } from "./testRender"
import { act, useEffect, useState } from "react"
import { ThemeProvider } from "../src/ui/theme"
import { EnvSidebar } from "../src/ui/env-editor/EnvSidebar"

const testRender = createTestRender()

function Harness({ initial, next }: { initial: string[]; next: string[] }) {
  const [names, setNames] = useState(initial)
  useEffect(() => {
    const t = setTimeout(() => setNames(next), 5)
    return () => clearTimeout(t)
  }, [next])
  return (
    <EnvSidebar
      envNames={names}
      selectedEnvName={null}
      activeEnvName={undefined}
      dirty={false}
      onSelectEnv={() => {}}
      onCreate={() => {}}
      onClone={() => {}}
      onDelete={() => {}}
      focused={false}
    />
  )
}

describe("EnvSidebar list update", () => {
  it("shows env inserted in middle after re-render (clone non-last)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          initial={["alpha", "beta", "gamma"]}
          next={["alpha", "beta", "beta - Copy", "gamma"]}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("beta - Copy")
  })

  it("shows env appended at end after re-render (clone last)", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          initial={["alpha", "beta", "gamma"]}
          next={["alpha", "beta", "gamma", "delta"]}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("delta")
  })
})
