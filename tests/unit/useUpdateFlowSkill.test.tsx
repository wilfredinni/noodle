import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

  it("leaves managed Homebrew skills untouched and reports the upgrade command", async () => {
    home = await mkdtemp(join(tmpdir(), "noodle-update-skill-flow-"))
    await mkdir(join(home, ".agents", "skills", "noodle-use"), {
      recursive: true,
    })
    const skillPath = join(home, ".agents", "skills", "noodle-use", "SKILL.md")
    await writeFile(skillPath, "existing skill")
    const commands: string[][] = []
    const phases: string[] = []
    const available = Promise.withResolvers<void>()
    const dependencies: Partial<UpdateDependencies> = {
      execPath: "/opt/homebrew/Cellar/noodle/0.7.5/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: { HOME: home },
      runProcess: async (args) => {
        commands.push(args)
        if (args[1] === "info")
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              formulae: [{ versions: { stable: "99.0.0" } }],
            }),
          }
        return { exitCode: 0 }
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
              if (flow.phase === "available") available.resolve()
            }}
          />
        </ThemeProvider>,
        { width: 80, height: 10 },
      )
    })
    try {
      await act(async () => render.renderOnce())
      await act(async () => {
        await available.promise
        await render.renderOnce()
      })
      await act(async () => render.renderOnce())

      expect(phases).not.toContain("installing")
      expect(phases.at(-1)).toBe("available")
      expect(commands).toEqual([
        ["/opt/homebrew/bin/brew", "info", "--json=v2", "noodle"],
      ])
      expect(await readFile(skillPath, "utf8")).toBe("existing skill")
      expect(render.captureCharFrame()).toContain("Run: brew upgrade noodle")
    } finally {
      await act(async () => {
        if (!render.renderer.isDestroyed) render.renderer.destroy()
      })
    }
  })
})
