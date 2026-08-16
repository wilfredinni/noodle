import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect } from "react"
import pkg from "../../package.json" with { type: "json" }
import type { UpdateDependencies } from "../../src/app/commands/update"
import { sha256 } from "../../src/app/commands/update"
import type { UpdateFlowState } from "../../src/ui/appState"
import { useUpdateFlow } from "../../src/ui/useUpdateFlow"
import { createTestRender } from "../testRender"

const testRender = createTestRender()
type UpdateHook = ReturnType<typeof useUpdateFlow>

function Harness({
  dependencies,
  onState,
}: {
  dependencies: Partial<UpdateDependencies>
  onState: (state: UpdateHook) => void
}) {
  const state = useUpdateFlow(dependencies)
  useEffect(() => onState(state), [onState, state])
  return null
}

function manifest(version: string, sha: string): string {
  return JSON.stringify({
    version,
    assets: { "macos-arm64": { sha256: sha } },
  })
}

describe("useUpdateFlow", () => {
  let dir: string
  let cachePath: string
  let execPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-update-hook-"))
    cachePath = join(dir, "update-cache.json")
    execPath = join(dir, "noodle")
    await writeFile(execPath, "old")
    await writeFile(
      cachePath,
      JSON.stringify({
        latestTag: `v${pkg.version}`,
        checkedAt: 1000,
        checksums: { "macos-arm64": "a".repeat(64) },
      }),
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function renderHook(
    dependencies: Partial<UpdateDependencies>,
    waitForInitialState = true,
  ) {
    let state: UpdateHook | undefined
    const phases: string[] = []
    const render = await testRender(
      <Harness
        dependencies={dependencies}
        onState={(next) => {
          state = next
          if (phases.at(-1) !== next.updateFlow.phase)
            phases.push(next.updateFlow.phase)
        }}
      />,
      { width: 1, height: 1 },
    )
    await render.renderOnce()

    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 100; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          await render.flush()
        })
        if (predicate()) return
      }
      throw new Error("Timed out waiting for update hook state")
    }

    if (waitForInitialState) await waitFor(() => state !== undefined)
    return { getState: () => state!, phases, waitFor }
  }

  function binaryDependencies(
    fetcher: UpdateDependencies["fetcher"],
  ): Partial<UpdateDependencies> {
    return {
      cachePath,
      execPath,
      platform: "darwin",
      arch: "arm64",
      env: {},
      now: () => 1000,
      fetcher,
    }
  }

  it("auto-installs a binary on startup and suppresses checks after completion", async () => {
    const binary = new TextEncoder().encode("new")
    let manifestChecks = 0
    const { getState, phases, waitFor } = await renderHook(
      binaryDependencies(async (input) => {
        if (String(input).endsWith("update.json")) {
          manifestChecks++
          return new Response(manifest("v99.0.0", sha256(binary)))
        }
        return new Response(binary)
      }),
    )

    await waitFor(() => getState().updateFlow.phase === "done")

    expect(phases).toContain("checking")
    expect(phases).toContain("downloading")
    expect(phases).toContain("installing")
    expect(phases).not.toContain("confirm")
    expect(getState().updateFlow).toEqual({
      phase: "done",
      version: "v99.0.0",
    })
    expect(await readFile(execPath, "utf8")).toBe("new")

    act(() => getState().triggerAboutUpdateCheck())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(manifestChecks).toBe(1)
  })

  it("retries a failed About check on the next opening", async () => {
    let checks = 0
    const { getState, waitFor } = await renderHook(
      binaryDependencies(async () => {
        checks++
        if (checks === 1)
          return new Response(
            JSON.stringify({ version: "v99.0.0", assets: {} }),
          )
        return new Response(manifest(`v${pkg.version}`, "a".repeat(64)))
      }),
    )

    await waitFor(() => getState().updateFlow.phase === "failed")
    act(() => getState().triggerAboutUpdateCheck())
    await waitFor(() => getState().updateFlow.phase === "up_to_date")

    expect(checks).toBe(2)
  })

  it("auto-installs Homebrew updates without confirmation", async () => {
    const commands: string[] = []
    const { getState, phases, waitFor } = await renderHook({
      execPath: "/opt/homebrew/Cellar/noodle/0.7.4/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async (args) => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        commands.push(args.join(" "))
        if (args[1] === "info") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              formulae: [
                {
                  versions: { stable: "99.0.0" },
                },
              ],
            }),
          }
        }
        return { exitCode: 0 }
      },
    })
    await waitFor(() => getState().updateFlow.phase === "done")

    expect(phases).toContain("installing")
    expect(phases).not.toContain("confirm")
    expect(commands).toEqual([
      "/opt/homebrew/bin/brew info --json=v2 noodle",
      "/opt/homebrew/bin/brew upgrade noodle",
    ])
  })

  it("maps unsupported runtimes back to the version-only idle state", async () => {
    let hook: Awaited<ReturnType<typeof renderHook>> | undefined
    await act(async () => {
      hook = await renderHook(
        {
          execPath: "/opt/homebrew/bin/bun",
          platform: "darwin",
          arch: "arm64",
          env: {},
        },
        false,
      )
    })
    const { getState, phases, waitFor } = hook!

    await waitFor(
      () =>
        phases.includes("checking") && getState().updateFlow.phase === "idle",
    )

    expect(getState().updateFlow).toEqual({ phase: "idle" })
  })

  it("shows every development preview on startup without checking or installing", async () => {
    const previousPreview = process.env.NOODLE_UPDATE_PREVIEW
    let fetches = 0
    try {
      const cases: Array<[string, UpdateFlowState]> = [
        ["idle", { phase: "idle" }],
        ["checking", { phase: "checking" }],
        ["up_to_date", { phase: "up_to_date" }],
        [
          "downloading",
          {
            phase: "downloading",
            version: "v0.7.5",
            installType: "binary",
          },
        ],
        [
          "installing",
          {
            phase: "installing",
            version: "v0.7.5",
            installType: "binary",
          },
        ],
        ["done", { phase: "done", version: "v0.7.5" }],
        ["failed", { phase: "failed", message: "Preview failure" }],
      ]

      for (const [preview, expected] of cases) {
        process.env.NOODLE_UPDATE_PREVIEW = preview
        const { getState, waitFor } = await renderHook(
          binaryDependencies(async () => {
            fetches++
            throw new Error("preview should not fetch")
          }),
        )
        await waitFor(() => getState().updateFlow.phase === expected.phase)
        expect(getState().updateFlow).toEqual(expected)
      }
      expect(fetches).toBe(0)
    } finally {
      if (previousPreview === undefined)
        delete process.env.NOODLE_UPDATE_PREVIEW
      else process.env.NOODLE_UPDATE_PREVIEW = previousPreview
    }
  })
})
