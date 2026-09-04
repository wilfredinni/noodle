import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect, useState } from "react"
import { createTestRender } from "../testRender"
import {
  useEnvironments,
  type UseEnvironmentsResult,
} from "../../src/hooks/useEnvironments"

const testRender = createTestRender()

function Harness({
  dir,
  onChange,
  onState,
  onEnvListChange,
}: {
  dir: string
  onChange: (name: string | null) => void
  onState: (state: UseEnvironmentsResult) => void
  onEnvListChange?: (setEnvList: (names: string[]) => void) => void
}) {
  const [envList, setEnvList] = useState([
    "development",
    "production",
    "broken",
  ])
  const environments = useEnvironments(
    dir,
    envList,
    undefined,
    undefined,
    onChange,
  )
  useEffect(() => onState(environments), [environments, onState])
  useEffect(() => onEnvListChange?.(setEnvList), [onEnvListChange])
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
    expect(state?.status).toBe("active")
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
    expect(state?.status).toBe("error")
    expect(changes).toEqual([])
  })

  it("wraps arbitrary cycle deltas across the environment list", async () => {
    let state: UseEnvironmentsResult | undefined
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={() => {}}
        onState={(next) => {
          state = next
        }}
      />,
      { width: 80, height: 4 },
    )

    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")
    act(() => state!.cycle(7))
    await waitUntil(() => state?.activeEnv?.name === "production")
    act(() => state!.cycle(-4))
    await waitUntil(() => state?.activeEnv?.name === "development")
  })

  it("ignores a stale reload after the active environment changes", async () => {
    let state: UseEnvironmentsResult | undefined
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={() => {}}
        onState={(next) => {
          state = next
        }}
      />,
      { width: 80, height: 4 },
    )

    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")
    const staleReload = state!.reloadActiveEnv
    act(() => state!.select("production"))
    await staleReload()
    await waitUntil(() => state?.activeEnv?.name === "production")

    expect(state?.activeName).toBe("production")
    expect(state?.activeEnv?.vars.HOST).toBe("prod")
  })

  it("preserves the active environment by name when the list changes", async () => {
    const changes: Array<string | null> = []
    let state: UseEnvironmentsResult | undefined
    let setEnvList: ((names: string[]) => void) | undefined
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={(name) => changes.push(name)}
        onState={(next) => {
          state = next
        }}
        onEnvListChange={(setter) => {
          setEnvList = setter
        }}
      />,
      { width: 80, height: 4 },
    )

    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")
    act(() => state!.select("production"))
    await waitUntil(() => state?.activeEnv?.name === "production")

    act(() => setEnvList!(["production", "development", "broken"]))
    await renderOnce()
    expect(state?.activeName).toBe("production")
    expect(state?.activeIndex).toBe(0)

    act(() => setEnvList!(["development", "broken"]))
    await waitUntil(() => state?.activeEnv?.name === "development")
    expect(state?.activeName).toBe("development")
    expect(state?.activeIndex).toBe(0)
    expect(changes).toEqual(["production", "development"])
  })

  it("selects a freshly written environment as its list is published", async () => {
    const changes: Array<string | null> = []
    let state: UseEnvironmentsResult | undefined
    let setEnvList: ((names: string[]) => void) | undefined
    await writeFile(join(dir, "renamed.env"), "HOST=renamed\n")
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={(name) => changes.push(name)}
        onState={(next) => {
          state = next
        }}
        onEnvListChange={(setter) => {
          setEnvList = setter
        }}
      />,
      { width: 80, height: 4 },
    )
    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")

    act(() => {
      setEnvList!(["renamed", "production", "broken"])
      state!.select("renamed")
    })
    await waitUntil(() => state?.activeEnv?.name === "renamed")
    expect(state?.activeEnv?.vars.HOST).toBe("renamed")
    expect(changes).toEqual(["renamed"])
  })

  it("clears selection when the final environment is deleted", async () => {
    const changes: Array<string | null> = []
    let state: UseEnvironmentsResult | undefined
    let setEnvList: ((names: string[]) => void) | undefined
    const { renderOnce } = await testRender(
      <Harness
        dir={dir}
        onChange={(name) => changes.push(name)}
        onState={(next) => {
          state = next
        }}
        onEnvListChange={(setter) => {
          setEnvList = setter
        }}
      />,
      { width: 80, height: 4 },
    )
    await renderOnce()
    await waitUntil(() => state?.activeEnv?.name === "development")

    act(() => {
      setEnvList!([])
      state!.clear()
    })
    await waitUntil(() => state?.activeName === null)
    expect(state?.activeEnv).toBeNull()
    expect(state?.activeIndex).toBe(-1)
    expect(changes).toEqual([null])
  })
})
