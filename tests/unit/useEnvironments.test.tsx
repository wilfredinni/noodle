import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import {
  useEnvironments,
  type UseEnvironmentsResult,
} from "../../src/hooks/useEnvironments"

function Harness({
  dir,
  onChange,
  onState,
}: {
  dir: string
  onChange: (name: string | null) => void
  onState: (state: UseEnvironmentsResult) => void
}) {
  const environments = useEnvironments(
    dir,
    ["development", "production", "broken"],
    undefined,
    undefined,
    onChange,
  )
  onState(environments)
  return null
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for state")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
}

describe("useEnvironments", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-environments-"))
    await mkdir(join(dir, ".environments"))
    dir = join(dir, ".environments")
    await writeFile(join(dir, "development.env"), "HOST=dev\n")
    await writeFile(join(dir, "production.env"), "HOST=prod\n")
    await writeFile(join(dir, "broken.env"), "invalid\n")
  })

  afterEach(async () => {
    await rm(join(dir, ".."), { recursive: true })
  })

  it("selects and reports an environment by name", async () => {
    const changes: Array<string | null> = []
    let state: UseEnvironmentsResult | undefined
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={(name) => changes.push(name)}
        onState={(next) => {
          state = next
        }}
      />,
      { width: 80, height: 4 },
    )

    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")
    act(() => {
      state!.select("production")
    })
    await waitUntil(() => state?.activeEnv?.name === "production")

    expect(state?.activeIndex).toBe(1)
    expect(state?.error).toBeNull()
    expect(changes).toEqual(["production"])
  })

  it("keeps selection errors local and does not report a change", async () => {
    const changes: Array<string | null> = []
    let state: UseEnvironmentsResult | undefined
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={(name) => changes.push(name)}
        onState={(next) => {
          state = next
        }}
      />,
      { width: 100, height: 4 },
    )

    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")
    act(() => {
      state!.select("broken")
    })
    await waitUntil(() => state?.error !== null)

    expect(state?.activeIndex).toBe(2)
    expect(state?.activeEnv).toBeNull()
    expect(state?.error?.message).toBe(
      'env.load: invalid line (expected KEY=value): "invalid"',
    )
    expect(changes).toEqual([])
  })
})
