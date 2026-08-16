import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect } from "react"
import type { RefObject } from "react"
import pkg from "../../package.json" with { type: "json" }
import type { UpdateDependencies } from "../../src/app/commands/update"
import { sha256 } from "../../src/app/commands/update"
import { useUpdateFlow } from "../../src/ui/useUpdateFlow"
import { createTestRender } from "../testRender"

const testRender = createTestRender()
type UpdateHook = ReturnType<typeof useUpdateFlow>

function Harness({
  dependencies,
  overlayActiveRef,
  onState,
}: {
  dependencies: Partial<UpdateDependencies>
  overlayActiveRef: RefObject<boolean>
  onState: (state: UpdateHook) => void
}) {
  const state = useUpdateFlow(overlayActiveRef, dependencies)
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

  async function renderHook(dependencies: Partial<UpdateDependencies>) {
    let state: UpdateHook | undefined
    const phases: string[] = []
    const overlayActiveRef = { current: false }
    const render = await testRender(
      <Harness
        dependencies={dependencies}
        overlayActiveRef={overlayActiveRef}
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

    await waitFor(() => state !== undefined)
    return { getState: () => state!, overlayActiveRef, phases, waitFor }
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

  it("auto-installs a binary from About and suppresses checks after completion", async () => {
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

    act(() => getState().triggerAboutUpdateCheck())
    await waitFor(() => getState().updateFlow.phase === "done")

    expect(phases).toContain("checking")
    expect(phases).toContain("downloading")
    expect(phases).toContain("installing")
    expect(phases).not.toContain("confirm")
    expect(getState().restartVersion).toBe("v99.0.0")
    expect(await readFile(execPath, "utf8")).toBe("new")

    act(() => getState().triggerAboutUpdateCheck())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(manifestChecks).toBe(1)
  })

  it("keeps manual confirmation while another overlay is active", async () => {
    const binary = new TextEncoder().encode("new")
    const { getState, overlayActiveRef, waitFor } = await renderHook(
      binaryDependencies(async (input) =>
        String(input).endsWith("update.json")
          ? new Response(manifest("v99.0.0", sha256(binary)))
          : new Response(binary),
      ),
    )

    overlayActiveRef.current = true
    act(() => getState().triggerUpdateCheck())
    await waitFor(() => getState().updateFlow.phase === "confirm")

    expect(await readFile(execPath, "utf8")).toBe("old")
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

    act(() => getState().triggerAboutUpdateCheck())
    await waitFor(() => getState().updateFlow.phase === "failed")
    act(() => getState().triggerAboutUpdateCheck())
    await waitFor(() => getState().updateFlow.phase === "up_to_date")

    expect(checks).toBe(2)
  })

  it("auto-installs Homebrew updates without confirmation", async () => {
    let infoChecks = 0
    const commands: string[] = []
    const { getState, phases, waitFor } = await renderHook({
      execPath: "/opt/homebrew/bin/noodle",
      platform: "darwin",
      arch: "arm64",
      env: {},
      runProcess: async (args) => {
        commands.push(args.join(" "))
        if (args[1] === "info") {
          infoChecks++
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              formulae: [
                {
                  versions: {
                    stable: infoChecks === 1 ? pkg.version : "99.0.0",
                  },
                },
              ],
            }),
          }
        }
        return { exitCode: 0 }
      },
    })
    await waitFor(() => infoChecks === 1)

    act(() => getState().triggerAboutUpdateCheck())
    await waitFor(() => getState().updateFlow.phase === "done")

    expect(phases).toContain("installing")
    expect(phases).not.toContain("confirm")
    expect(commands).toEqual([
      "brew info --json=v2 noodle",
      "brew info --json=v2 noodle",
      "brew upgrade noodle",
    ])
  })

  it("maps unsupported runtimes back to the version-only idle state", async () => {
    const { getState, phases, waitFor } = await renderHook({
      execPath: "/opt/homebrew/bin/bun",
      platform: "darwin",
      arch: "arm64",
      env: {},
    })

    act(() => getState().triggerAboutUpdateCheck())
    await waitFor(
      () =>
        phases.includes("checking") && getState().updateFlow.phase === "idle",
    )

    expect(getState().restartVersion).toBeNull()
  })
})
