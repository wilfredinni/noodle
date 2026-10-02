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
import {
  getUpdateStatusSegments,
  UpdateStatusSpans,
} from "../../src/ui/UpdateStatus"
import { ThemeProvider } from "../../src/ui/theme"
import { Toast, takeToastMessage } from "../../src/ui/Toast"
import { createTestRender } from "../testRender"

const testRender = createTestRender()
type UpdateHook = ReturnType<typeof useUpdateFlow>

function Harness({
  dependencies,
  onState,
  renderStatus = false,
}: {
  dependencies: Partial<UpdateDependencies>
  onState: (state: UpdateHook) => void
  renderStatus?: boolean
}) {
  const state = useUpdateFlow(dependencies)
  useEffect(() => onState(state), [onState, state])
  return renderStatus ? (
    <ThemeProvider activeIndex={0} previewIndex={null}>
      <text>
        <UpdateStatusSpans
          segments={getUpdateStatusSegments(state.updateFlow)}
        />
      </text>
      <Toast />
    </ThemeProvider>
  ) : null
}

function manifest(
  version: string,
  sha: string,
  platform = "macos-arm64",
): string {
  return JSON.stringify({
    version,
    assets: { [platform]: { sha256: sha } },
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
    renderStatus = false,
  ) {
    let state: UpdateHook | undefined
    const phases: string[] = []
    let render!: Awaited<ReturnType<typeof testRender>>
    await act(async () => {
      render = await testRender(
        <Harness
          dependencies={dependencies}
          renderStatus={renderStatus}
          onState={(next) => {
            state = next
            if (phases.at(-1) !== next.updateFlow.phase)
              phases.push(next.updateFlow.phase)
          }}
        />,
        { width: renderStatus ? 80 : 1, height: renderStatus ? 12 : 1 },
      )
      await render.renderOnce()
    })

    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 2000
      while (Date.now() < deadline) {
        await act(async () => {
          await new Promise<void>((resolve) => setImmediate(resolve))
          await render.flush()
        })
        if (predicate()) return
      }
      throw new Error("Timed out waiting for update hook state")
    }

    if (waitForInitialState) await waitFor(() => state !== undefined)
    return { getState: () => state!, phases, waitFor, render }
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
    const { getState, phases, waitFor, render } = await renderHook(
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
    await act(async () => render.flush())
    expect(manifestChecks).toBe(1)
  })

  it("renders a staged Windows update as restart-to-apply and suppresses repeat checks", async () => {
    const binary = new TextEncoder().encode("new")
    const executable = `${execPath}.exe`
    await writeFile(executable, "old")
    let checks = 0
    let launches = 0
    const { getState, waitFor, render } = await renderHook(
      {
        cachePath,
        execPath: executable,
        platform: "win32",
        arch: "x64",
        env: {},
        fetcher: async (input) => {
          if (String(input).endsWith("update.json")) {
            checks++
            return new Response(
              manifest("v99.0.0", sha256(binary), "windows-x86_64"),
            )
          }
          return new Response(binary)
        },
        startProcess: () => {
          launches++
        },
      },
      true,
      true,
    )
    await waitFor(() => getState().updateFlow.phase === "done")
    await act(async () => render.renderOnce())
    expect(render.captureCharFrame()).toContain("Restart to apply v99.0.0")
    expect(render.captureCharFrame().replaceAll("─", " ")).toContain(
      "Update staged; restart Noodle to apply",
    )
    expect(render.captureCharFrame()).not.toContain("Update completed")
    const details = { message: null as string | null }
    act(() => {
      details.message = takeToastMessage()
    })
    expect(details.message).toContain(join(dir, ".noodle-update.log"))
    expect(details.message).toContain("noodle update")
    expect(await readFile(executable, "utf8")).toBe("old")
    act(() => getState().triggerAboutUpdateCheck())
    await act(async () => render.flush())
    expect(checks).toBe(1)
    expect(launches).toBe(1)
  })

  it.each([
    "Failed to finish the Noodle update: wrong version\nRecovery files were retained.",
    "Rollback failed: access denied\nFailed to finish the Noodle update: locked executable",
    "Failed to stage update: PowerShell unavailable",
  ])(
    "surfaces a previous Windows failure before starting another update: %s",
    async (log) => {
      const logPath = join(dir, ".noodle-update.log")
      await writeFile(logPath, log)
      let checks = 0
      const { getState, waitFor, render } = await renderHook(
        {
          ...binaryDependencies(async () => {
            checks++
            return new Response(
              manifest(`v${pkg.version}`, "a".repeat(64), "windows-x86_64"),
            )
          }),
          platform: "win32",
          arch: "x64",
        },
        true,
        true,
      )
      await waitFor(() => getState().updateFlow.phase === "failed")
      const flow = getState().updateFlow
      expect(flow.phase === "failed" && flow.message).toContain(logPath)
      expect(flow.phase === "failed" && flow.message).toContain("noodle update")
      expect(checks).toBe(0)
      expect(await readFile(logPath, "utf8")).toBe(log)
      await act(async () => render.renderOnce())
      expect(render.captureCharFrame()).toContain(
        "previous Windows update failed",
      )
      const details = { message: null as string | null }
      act(() => {
        details.message = takeToastMessage()
      })
      expect(details.message).toContain(logPath)
      expect(details.message).toContain("noodle update")
      act(() => getState().triggerAboutUpdateCheck())
      await waitFor(() => getState().updateFlow.phase === "up_to_date")
      expect(checks).toBe(1)
    },
  )

  it("checks normally when a competing helper succeeded after a failed update", async () => {
    const logPath = join(dir, ".noodle-update.log")
    const log =
      "Failed to finish the Noodle update: wrong version\r\nUpdate complete.\r\n"
    await writeFile(logPath, log)
    let checks = 0
    const { getState, waitFor } = await renderHook({
      ...binaryDependencies(async () => {
        checks++
        return new Response(
          manifest(`v${pkg.version}`, "a".repeat(64), "windows-x86_64"),
        )
      }),
      platform: "win32",
      arch: "x64",
    })
    await waitFor(() => getState().updateFlow.phase === "up_to_date")
    expect(checks).toBe(1)
    expect(await readFile(logPath, "utf8")).toBe(log)
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
        await Promise.resolve()
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
