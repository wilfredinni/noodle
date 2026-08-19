import { describe, it, expect } from "bun:test"
import { createTestRender } from "./testRender"
import {
  act,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { ThemeProvider } from "../src/ui/theme"
import { EnvSidebar } from "../src/ui/env-editor/EnvSidebar"

const testRender = createTestRender()

function Harness({
  initial,
  onReady,
}: {
  initial: string[]
  onReady: (setNames: Dispatch<SetStateAction<string[]>>) => void
}) {
  const [names, setNames] = useState(initial)
  useEffect(() => {
    onReady(setNames)
  }, [onReady])
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
    let setNames: Dispatch<SetStateAction<string[]>> | null = null
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          initial={["alpha", "beta", "gamma"]}
          onReady={(setter) => {
            setNames = setter
          }}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    expect(setNames).not.toBeNull()
    await act(async () => setNames!(["alpha", "beta", "beta - Copy", "gamma"]))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("beta - Copy")
  })

  it("shows env appended at end after re-render (clone last)", async () => {
    let setNames: Dispatch<SetStateAction<string[]>> | null = null
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          initial={["alpha", "beta", "gamma"]}
          onReady={(setter) => {
            setNames = setter
          }}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    expect(setNames).not.toBeNull()
    await act(async () => setNames!(["alpha", "beta", "gamma", "delta"]))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("delta")
  })
})
