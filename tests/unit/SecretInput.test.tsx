import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { SecretInput } from "../../src/ui/settings/SecretInput"
import { ThemeProvider } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

describe("SecretInput", () => {
  it("commits a dirty draft when directly unmounted", async () => {
    const { keymap, cleanup } = setupKeymap()
    const commits: string[] = []
    let hide = () => {}

    function Harness() {
      const [visible, setVisible] = useState(true)
      hide = () => setVisible(false)
      return visible ? (
        <SecretInput
          focused
          placeholder="secret"
          onFocus={() => {}}
          onCommit={async (value) => {
            commits.push(value)
            return true
          }}
        />
      ) : null
    }

    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 30, height: 3 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("secret"))
    await act(async () => hide())
    await Promise.resolve()
    expect(commits).toEqual(["secret"])
    cleanup()
  })

  it("does not commit after Escape and unmount", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const commits: string[] = []
    let hide = () => {}

    function Harness() {
      const [visible, setVisible] = useState(true)
      hide = () => setVisible(false)
      return visible ? (
        <SecretInput
          focused
          placeholder="secret"
          onFocus={() => {}}
          onCommit={async (value) => {
            commits.push(value)
            return true
          }}
        />
      ) : null
    }

    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 30, height: 3 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("secret"))
    await act(async () => host.press("escape"))
    await act(async () => hide())
    await Promise.resolve()
    expect(commits).toEqual([])
    cleanup()
  })

  it("does not commit twice when Return is followed by unmount", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const commits: string[] = []
    let hide = () => {}

    function Harness() {
      const [visible, setVisible] = useState(true)
      hide = () => setVisible(false)
      return visible ? (
        <SecretInput
          focused
          placeholder="secret"
          onFocus={() => {}}
          onCommit={async (value) => {
            commits.push(value)
            return true
          }}
        />
      ) : null
    }

    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 30, height: 3 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("secret"))
    await act(async () => host.press("return"))
    await act(async () => hide())
    await Promise.resolve()
    expect(commits).toEqual(["secret"])
    cleanup()
  })
})
