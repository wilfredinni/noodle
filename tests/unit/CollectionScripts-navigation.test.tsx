import { expect, it } from "bun:test"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { CollectionScripts } from "../../src/ui/settings/CollectionScripts"
import type { ScriptPhase } from "../../src/preRequestScript"
import { ThemeProvider } from "../../src/ui/theme"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()
it("opens a newly requested collection phase while Scripts is already mounted", async () => {
  const { keymap, host } = setupKeymap()
  let navigate!: (phase: ScriptPhase) => void
  function Harness() {
    const [phase, setPhase] = useState<ScriptPhase>("pre")
    const [phaseRequest, setPhaseRequest] = useState(0)
    navigate = (phase) => {
      setPhase(phase)
      setPhaseRequest((request) => request + 1)
    }
    return (
      <CollectionScripts
        initialPhase={phase}
        phaseRequest={phaseRequest}
        fields={{
          scripts: { pre: "./pre.js", post: "./post.js" },
          tests: "./tests.js",
        }}
        focused
        onFocus={() => {}}
        onEditingChange={() => {}}
        onChange={async () => true}
      />
    )
  }
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 80, height: 24 },
  )
  for (const phase of ["pre", "post", "tests", "pre"] as const) {
    await act(async () => navigate(phase))
    await act(async () => render.renderOnce())
    expect(render.captureCharFrame()).toContain(`./${phase}.js`)
    for (const other of ["pre", "post", "tests"]) {
      if (other !== phase)
        expect(render.captureCharFrame()).not.toContain(`./${other}.js`)
    }
  }
  await act(async () => host.press("right"))
  await act(async () => render.renderOnce())
  expect(render.captureCharFrame()).toContain("./post.js")
  await act(async () => navigate("pre"))
  await act(async () => render.renderOnce())
  expect(render.captureCharFrame()).toContain("./pre.js")
})
