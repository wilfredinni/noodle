import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect } from "react"
import {
  useCollectionCookieJar,
  type CollectionCookieJarState,
} from "../../src/hooks/useCollectionCookieJar"
import { setSecretBackendForTests } from "../../src/secrets"
import { createTestRender } from "../testRender"

const testRender = createTestRender()

function Harness({
  collectionDir,
  configDir,
  onState,
}: {
  collectionDir: string
  configDir: string
  onState: (state: CollectionCookieJarState) => void
}) {
  const state = useCollectionCookieJar(collectionDir, configDir)
  useEffect(() => onState(state), [onState, state])
  return null
}

describe("useCollectionCookieJar", () => {
  let dir: string
  let collectionDir: string
  let configDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-cookie-hook-"))
    collectionDir = join(dir, "collection")
    configDir = join(dir, "config")
    await writeFile(collectionDir, "blocked", "utf8")
    const values = new Map<string, string>()
    setSecretBackendForTests({
      async get({ service, name }) {
        return values.get(`${service}:${name}`) ?? null
      },
      async set({ service, name, value }) {
        values.set(`${service}:${name}`, value)
      },
      async delete({ service, name }) {
        return values.delete(`${service}:${name}`)
      },
    })
  })

  afterEach(async () => {
    setSecretBackendForTests(undefined)
    await rm(dir, { recursive: true, force: true })
  })

  async function renderHook() {
    let state: CollectionCookieJarState | undefined
    const onState = (next: CollectionCookieJarState) => {
      state = next
    }
    const render = await testRender(
      <Harness
        collectionDir={collectionDir}
        configDir={configDir}
        onState={onState}
      />,
      { width: 1, height: 1 },
    )
    const waitForState = async (predicate: () => boolean) => {
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          await render.flush()
        })
        if (predicate()) return
      }
      throw new Error("Timed out waiting for cookie hook state")
    }
    await waitForState(() => state?.status.state === "unavailable")
    return { getState: () => state!, waitForState }
  }

  async function restoreCollectionDirectory() {
    await rm(collectionDir)
    await mkdir(collectionDir)
  }

  it("retries initialization when no jar handle exists", async () => {
    const { getState, waitForState } = await renderHook()
    expect(getState().jar).toBeNull()
    await restoreCollectionDirectory()

    await act(async () => getState().retry())
    await waitForState(() => getState().jar !== null)

    expect(getState().jar).not.toBeNull()
    expect(getState().status.state).toBe("encrypted")
  })

  it("resets storage when no jar handle exists", async () => {
    const { getState, waitForState } = await renderHook()
    expect(getState().jar).toBeNull()
    await restoreCollectionDirectory()

    await act(async () => getState().reset())
    await waitForState(() => getState().jar !== null)

    expect(getState().jar).not.toBeNull()
    expect(getState().status.state).toBe("encrypted")
  })
})
