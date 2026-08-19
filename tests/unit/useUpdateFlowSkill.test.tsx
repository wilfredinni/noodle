import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect } from "react"
import type { UpdateDependencies } from "../../src/app/commands/update"
import type { UpdateFlowState } from "../../src/ui/appState"
import { ThemeProvider } from "../../src/ui/theme"
import { Toast } from "../../src/ui/Toast"
import { useUpdateFlow } from "../../src/ui/useUpdateFlow"
import { createTestRender } from "../testRender"

const testRender = createTestRender()

function Harness({
  dependencies,
  onFlow,
}: {
  dependencies: Partial<UpdateDependencies>
  onFlow: (flow: UpdateFlowState) => void
}) {
  const { updateFlow } = useUpdateFlow(dependencies)
  useEffect(() => onFlow(updateFlow), [onFlow, updateFlow])
  return <text>{updateFlow.phase}</text>
}

describe("useUpdateFlow skill refresh", () => {
  let home: string | undefined

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true })
    home = undefined
  })

  it("finishes with a warning when skill refresh fails", async () => {
    home = await mkdtemp(join(tmpdir(), "noodle-update-skill-flow-"))
    await mkdir(join(home, ".agents", "skills", "noodle-use"), {
      recursive: true,
    })
    const commands: string[][] = []
    const phases: string[] = []
    const skillRefreshStarted = Promise.withResolvers<void>()
    const skillRefreshFinished = Promise.withResolvers<void>()
    const dependencies: Partial<UpdateDependencies> = {
      execPath: "/opt/homebrew/Cellar/noodle/0.7.5/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: { HOME: home },
      runProcess: async (args) => {
        commands.push(args)
        const skillRefresh = args[0].endsWith("/noodle")
        if (skillRefresh) skillRefreshStarted.resolve()
        if (args[1] === "info")
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              formulae: [{ versions: { stable: "99.0.0" } }],
            }),
          }
        const result = { exitCode: skillRefresh ? 1 : 0 }
        if (skillRefresh) skillRefreshFinished.resolve()
        return result
      },
    }

    let render!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      render = await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Toast />
          <Harness
            dependencies={dependencies}
            onFlow={(flow) => {
              if (phases.at(-1) !== flow.phase) phases.push(flow.phase)
            }}
          />
        </ThemeProvider>,
        { width: 80, height: 10 },
      )
    })
    try {
      await act(async () => render.renderOnce())
      await act(async () => {
        await skillRefreshStarted.promise
        await skillRefreshFinished.promise
        await render.renderOnce()
      })
      await act(async () => render.renderOnce())

      expect(phases).toContain("installing")
      expect(phases.at(-1)).toBe("done")
      expect(commands).toEqual([
        ["/opt/homebrew/bin/brew", "info", "--json=v2", "noodle"],
        ["/opt/homebrew/bin/brew", "upgrade", "noodle"],
        ["/opt/homebrew/bin/noodle", "agent", "install", "--json"],
      ])
      expect(render.captureCharFrame()).toContain(
        "Noodle updated; skill update failed",
      )
    } finally {
      await act(async () => {
        if (!render.renderer.isDestroyed) render.renderer.destroy()
      })
    }
  })
})
