import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test"
import { createTestRender } from "./testRender"
import { act, useEffect, useRef, useState } from "react"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { ThemeProvider } from "../src/ui/theme"
import { useEnvironmentEditor } from "../src/hooks/useEnvironmentEditor"
import { env } from "../src/env"
import {
  getStoredSecret,
  setSecretBackendForTests,
  setStoredSecret,
  type SecretBackend,
} from "../src/secrets"

function memoryBackend(): SecretBackend & {
  values: Map<string, string>
  failDelete: boolean
  failSet: boolean
} {
  const values = new Map<string, string>()
  const result: SecretBackend & {
    values: Map<string, string>
    failDelete: boolean
    failSet: boolean
  } = {
    values,
    failDelete: false,
    failSet: false,
    async get({ service, name }) {
      return values.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value }) {
      if (result.failSet) throw new Error("backend set unavailable")
      values.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      if (result.failDelete) throw new Error("backend delete unavailable")
      return values.delete(`${service}:${name}`)
    },
  }
  return result
}

const testRender = createTestRender()

let dir: string

async function waitForDraft(
  editorRef: { current: ReturnType<typeof useEnvironmentEditor> | null },
  renderOnce: () => Promise<void>,
) {
  const deadline = Date.now() + 1_000
  while (!editorRef.current?.draft) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for environment draft")
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    await renderOnce()
  }
}

function Harness({
  onEnvsChanged: onChanged,
  onEnvDataChanged,
  onActiveEnvChanged = () => {},
  editorRef,
}: {
  onEnvsChanged: (names?: string[]) => void
  onEnvDataChanged?: () => void
  onActiveEnvChanged?: (name: string) => void
  editorRef: { current: ReturnType<typeof useEnvironmentEditor> | null }
}) {
  const editor = useEnvironmentEditor({
    environmentsDir: dir,
    envNames: ["alpha", "beta", "gamma"],
    activeEnvName: "alpha",
    onEnvsChanged: onChanged,
    onActiveEnvChanged,
    onEnvDataChanged,
  })

  editorRef.current = editor

  const readyCalled = useRef(false)
  useEffect(() => {
    if (!readyCalled.current) {
      readyCalled.current = true
      editor.openEditor("alpha")
    }
  }, [editor])

  return <box />
}

function ExternalNamesHarness({
  editorRef,
}: {
  editorRef: { current: ReturnType<typeof useEnvironmentEditor> | null }
}) {
  const [names, setNames] = useState<string[]>([])
  const editor = useEnvironmentEditor({
    environmentsDir: dir,
    envNames: names,
    activeEnvName: undefined,
    onEnvsChanged: () => {},
    onActiveEnvChanged: () => {},
  })

  editorRef.current = editor

  useEffect(() => {
    setNames(["development"])
  }, [])

  return <box />
}

describe("useEnvironmentEditor onEnvsChanged callback", () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-onEnvsChanged-"))
    await env.saveEnvironment(dir, { name: "alpha", vars: { key: "val" } })
    await env.saveEnvironment(dir, { name: "beta", vars: { key: "val" } })
    await env.saveEnvironment(dir, { name: "gamma", vars: { key: "val" } })
  })

  afterEach(async () => {
    delete process.env.NOODLE_PROCESS_SECRET
    setSecretBackendForTests(undefined)
    await rm(dir, { recursive: true, force: true })
  })

  it("picks up environment names added outside the editor", async () => {
    await env.saveEnvironment(dir, { name: "development", vars: {} })
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <ExternalNamesHarness editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()

    const deadline = Date.now() + 1_000
    while (!ref.current?.envNames.includes("development")) {
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for external environment names")
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      await renderOnce()
    }

    expect(ref.current!.envNames).toEqual(["development"])
  })

  it("calls onEnvsChanged after cloneEnv", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    await act(async () => {
      await ref.current!.cloneEnv("alpha-copy")
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("reports source load failures while cloning", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    const loadSpy = spyOn(env, "loadEnvironment").mockRejectedValue(
      new Error("source load failed"),
    )
    try {
      await act(async () => {
        await ref.current!.cloneEnv("alpha-copy")
      })
      await renderOnce()
      expect(ref.current!.error).toBe("source load failed")
    } finally {
      loadSpy.mockRestore()
    }
  })

  it("creates and selects a new empty environment without activating it", async () => {
    const changed = mock(() => {})
    const activated = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          onEnvsChanged={changed}
          onActiveEnvChanged={activated}
          editorRef={ref}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    await act(async () => {
      await ref.current!.createEnv({ name: "  staging  ", color: "warning" })
    })
    await renderOnce()

    expect(await readFile(join(dir, "staging.env"), "utf8")).toBe(
      "_color=warning\n",
    )
    expect(ref.current!.envNames).toContain("staging")
    expect(ref.current!.selectedEnvName).toBe("staging")
    expect(ref.current!.draft).toEqual({
      name: "staging",
      color: "warning",
      varRows: [],
    })
    expect(ref.current!.dirty).toBe(false)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(activated).not.toHaveBeenCalled()
  })

  it("coalesces repeated environment creation while saving", async () => {
    const changed = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={changed} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    let first!: Promise<void>
    let second!: Promise<void>
    await act(async () => {
      first = ref.current!.createEnv({ name: "staging", color: undefined })
      second = ref.current!.createEnv({ name: "staging", color: undefined })
      await Promise.all([first, second])
    })
    await renderOnce()

    expect(second).toBe(first)
    expect(ref.current!.envNames.filter((name) => name === "staging")).toEqual([
      "staging",
    ])
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("rejects duplicate and invalid new environment names", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)
    const alphaBefore = await readFile(join(dir, "alpha.env"), "utf8")

    await act(async () => {
      await expect(
        ref.current!.createEnv({ name: "  ", color: undefined }),
      ).rejects.toThrow("Environment name is required")
    })
    await renderOnce()
    expect(ref.current!.error).toBe("Environment name is required")

    await act(async () => {
      await expect(
        ref.current!.createEnv({ name: "alpha", color: "warning" }),
      ).rejects.toThrow('An environment named "alpha" already exists')
    })
    await renderOnce()
    expect(ref.current!.error).toBe(
      'An environment named "alpha" already exists',
    )
    await act(async () => {
      await expect(
        ref.current!.createEnv({ name: "bad/name", color: undefined }),
      ).rejects.toThrow("env.save: invalid environment name")
    })
    await renderOnce()
    expect(ref.current!.error).toBe("env.save: invalid environment name")

    expect(await readFile(join(dir, "alpha.env"), "utf8")).toBe(alphaBefore)
    expect(ref.current!.envNames).not.toContain("bad/name")
    expect(ref.current!.selectedEnvName).toBe("alpha")

    await act(async () => {
      await ref.current!.createEnv({ name: "staging", color: undefined })
    })
    await renderOnce()
    expect(ref.current!.envNames).toContain("staging")
    expect(ref.current!.error).toBeNull()
  })

  it("calls onEnvsChanged after deleteEnv", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    await act(async () => {
      await ref.current!.deleteEnv()
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("activates existing and new variable rows for editing", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => {
      ref.current!.activateVar(0)
    })
    await renderOnce()
    expect(ref.current!.editKey).toBe("key")
    expect(ref.current!.editValue).toBe("val")
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      row: 0,
      addingRow: false,
      subfield: "key",
    })

    act(() => {
      ref.current!.activateVar(0, false, "value")
    })
    await renderOnce()
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      row: 0,
      addingRow: false,
      subfield: "value",
    })

    act(() => {
      ref.current!.activateVar(-1, true)
    })
    await renderOnce()
    expect(ref.current!.editKey).toBe("")
    expect(ref.current!.editValue).toBe("")
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      row: -1,
      addingRow: true,
      subfield: "key",
    })
  })

  it("commits the active variable before activating another row", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => {
      ref.current!.activateVar(0)
      ref.current!.setEditKey("updated")
      ref.current!.setEditValue("value")
    })
    await renderOnce()

    act(() => {
      ref.current!.activateVar(-1, true)
    })
    await renderOnce()

    expect(ref.current!.draft?.varRows[0]).toMatchObject({
      key: "updated",
      value: "value",
    })
    expect(ref.current!.editState).toMatchObject({
      mode: "editing",
      addingRow: true,
    })
  })

  it("keeps the selected variable after committing a deletion above it", async () => {
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: { first: "one", second: "two" },
    })
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => {
      ref.current!.activateVar(0)
      ref.current!.setEditKey("")
    })
    await renderOnce()

    act(() => {
      ref.current!.activateVar(1)
    })
    await renderOnce()

    expect(ref.current!.draft?.varRows).toHaveLength(1)
    expect(ref.current!.editKey).toBe("second")
    expect(ref.current!.editValue).toBe("two")
    expect(ref.current!.editState).toMatchObject({ row: 0, editingRow: 0 })
  })

  it("delete env removes file from disk", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    const filePath = join(dir, "alpha.env")
    const before = await readFile(filePath, "utf8")
      .then(() => true)
      .catch(() => false)
    expect(before).toBe(true)

    await act(async () => {
      await ref.current!.deleteEnv()
    })

    const after = await readFile(filePath, "utf8")
      .then(() => true)
      .catch(() => false)
    expect(after).toBe(false)
  })

  it("keeps an environment retryable when secret cleanup fails", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { TOKEN: "keychain" },
    })
    await setStoredSecret(dirname(dir), "alpha", "TOKEN", "keychain-value")
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    backend.failDelete = true
    await act(async () => {
      await ref.current!.deleteEnv()
    })
    await renderOnce()

    expect(ref.current!.error).toContain("secret delete failed")
    expect(await readFile(join(dir, "alpha.env"), "utf8")).toContain(
      "# @secret TOKEN",
    )
    expect(await getStoredSecret(dirname(dir), "alpha", "TOKEN")).toBe(
      "keychain-value",
    )
  })

  it("calls onEnvsChanged after save with rename", async () => {
    const spy = mock(() => {})
    const activated = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          onEnvsChanged={spy}
          onActiveEnvChanged={activated}
          editorRef={ref}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    // Change name to trigger rename path
    await act(async () => {
      ref.current!.setName("alpha-renamed")
      await ref.current!.save()
    })

    act(() => {
      ref.current!.setColor("warning")
    })
    await renderOnce()

    await act(async () => {
      await ref.current!.selectEnv("alpha-renamed")
    })
    await renderOnce()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(["alpha-renamed", "beta", "gamma"])
    expect(activated).toHaveBeenCalledWith("alpha-renamed")
    expect(ref.current!.draft?.color).toBe("warning")
    expect(ref.current!.dirty).toBe(true)
  })

  it("calls onEnvDataChanged after save with same name (color edit)", async () => {
    const dataSpy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness
          onEnvsChanged={() => {}}
          onEnvDataChanged={dataSpy}
          editorRef={ref}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    // Edit without changing name (simulates color/vars edit)
    await act(async () => {
      ref.current!.setColor("warning")
      await ref.current!.save()
    })
    expect(dataSpy).toHaveBeenCalledTimes(1)
  })

  it("keeps an unsaved draft when selecting the current environment", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => {
      ref.current!.setColor("warning")
    })
    await renderOnce()
    expect(ref.current!.dirty).toBe(true)

    await act(async () => {
      await ref.current!.selectEnv("alpha")
    })
    await renderOnce()

    expect(ref.current!.draft?.color).toBe("warning")
    expect(ref.current!.dirty).toBe(true)
  })

  it("keeps the current environment selected when a load fails and retries", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    const originalLoad = env.loadEnvironment
    let betaAttempts = 0
    const loadSpy = spyOn(env, "loadEnvironment").mockImplementation(
      (environmentDir, name) => {
        if (name === "beta" && betaAttempts++ === 0) {
          return Promise.reject(new Error("failed to load beta"))
        }
        return originalLoad(environmentDir, name)
      },
    )

    try {
      let firstSelection = true
      await act(async () => {
        firstSelection = await ref.current!.selectEnv("beta")
      })
      await renderOnce()

      expect(firstSelection).toBe(false)
      expect(ref.current!.selectedEnvName).toBe("alpha")
      expect(ref.current!.draft?.name).toBe("alpha")

      let retrySelection = false
      await act(async () => {
        retrySelection = await ref.current!.selectEnv("beta")
      })
      await renderOnce()

      expect(retrySelection).toBe(true)
      expect(ref.current!.selectedEnvName).toBe("beta")
      expect(ref.current!.draft?.name).toBe("beta")
    } finally {
      loadSpy.mockRestore()
    }
  })

  it("keeps the latest environment when overlapping loads resolve out of order", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    type LoadedEnvironment = Awaited<ReturnType<typeof env.loadEnvironment>>
    const pending = new Map<string, (environment: LoadedEnvironment) => void>()
    const loadSpy = spyOn(env, "loadEnvironment").mockImplementation(
      (_dir, name) =>
        new Promise((resolve) => {
          pending.set(name, resolve)
        }),
    )

    try {
      let betaSelection!: Promise<boolean>
      let gammaSelection!: Promise<boolean>
      act(() => {
        betaSelection = ref.current!.selectEnv("beta")
        gammaSelection = ref.current!.selectEnv("gamma")
      })

      let gammaIsCurrent = false
      await act(async () => {
        pending.get("gamma")!({ name: "gamma", vars: { key: "gamma" } })
        gammaIsCurrent = await gammaSelection
      })
      await renderOnce()

      expect(gammaIsCurrent).toBe(true)
      expect(ref.current!.selectedEnvName).toBe("gamma")
      expect(ref.current!.draft?.varRows[0]?.value).toBe("gamma")

      let betaIsCurrent = true
      await act(async () => {
        pending.get("beta")!({ name: "beta", vars: { key: "beta" } })
        betaIsCurrent = await betaSelection
      })
      await renderOnce()

      expect(betaIsCurrent).toBe(false)
      expect(ref.current!.selectedEnvName).toBe("gamma")
      expect(ref.current!.draft?.varRows[0]?.value).toBe("gamma")
    } finally {
      loadSpy.mockRestore()
    }
  })

  it("keeps the loaded environment when cancelling a pending selection", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    type LoadedEnvironment = Awaited<ReturnType<typeof env.loadEnvironment>>
    let resolveBeta: ((environment: LoadedEnvironment) => void) | undefined
    const loadSpy = spyOn(env, "loadEnvironment").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBeta = resolve
        }),
    )

    try {
      let betaSelection!: Promise<boolean>
      let alphaSelection = false
      await act(async () => {
        betaSelection = ref.current!.selectEnv("beta")
        alphaSelection = await ref.current!.selectEnv("alpha")
      })

      expect(alphaSelection).toBe(true)

      let betaIsCurrent = true
      await act(async () => {
        resolveBeta!({ name: "beta", vars: { key: "beta" } })
        betaIsCurrent = await betaSelection
      })
      await renderOnce()

      expect(betaIsCurrent).toBe(false)
      expect(ref.current!.selectedEnvName).toBe("alpha")
      expect(ref.current!.draft?.name).toBe("alpha")
    } finally {
      loadSpy.mockRestore()
    }
  })

  it("rejects rename to an existing env name", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    // snapshot original beta content before test
    const betaBefore = await readFile(join(dir, "beta.env"), "utf8")

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    // Rename "alpha" -> "beta" (beta already exists)
    await act(async () => {
      ref.current!.setName("beta")
      await ref.current!.save()
    })

    const editor = ref.current!
    expect(editor.error).not.toBeNull()
    expect(editor.error).toContain("already exists")

    // onEnvsChanged must NOT be called (save didn't succeed)
    expect(spy).not.toHaveBeenCalled()

    // beta file on disk must be unchanged
    const betaAfter = await readFile(join(dir, "beta.env"), "utf8")
    expect(betaAfter).toBe(betaBefore)
  })

  it("adds new name to envNames when saving a brand new env", async () => {
    const spy = mock(() => {})
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }

    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={spy} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    // Close current editor, open new blank one
    await act(async () => {
      ref.current!.closeEditor()
      await ref.current!.openEditor() // no name = blank draft
    })
    await renderOnce()
    act(() => {
      ref.current!.setName("new-env")
      ref.current!.enterBrowse()
    })
    await renderOnce()
    act(() => {
      ref.current!.enterEdit()
    })
    await renderOnce()
    act(() => {
      ref.current!.setEditKey("key")
      ref.current!.setEditValue("value")
    })
    await renderOnce()
    act(() => {
      ref.current!.commitEdit()
    })
    await renderOnce()
    await act(async () => {
      await ref.current!.save()
    })
    await renderOnce()

    const editor = ref.current!
    expect(editor.error).toBeNull()
    expect(spy).toHaveBeenCalled()
    expect(editor.envNames).toContain("new-env")
  })

  it("does not overwrite an unlisted file from a blank draft", async () => {
    await env.saveEnvironment(dir, {
      name: "hidden",
      vars: { existing: "keep" },
    })
    const before = await readFile(join(dir, "hidden.env"), "utf8")
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)
    await act(async () => {
      await ref.current!.openEditor()
      ref.current!.setName("hidden")
      await ref.current!.save()
    })
    expect(ref.current!.error).toContain("already exists")
    expect(await readFile(join(dir, "hidden.env"), "utf8")).toBe(before)
  })

  it("preserves own-property variable names through an unrelated save", async () => {
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: Object.fromEntries([
        ["__proto__", "proto"],
        ["constructor", "ctor"],
        ["toString", "string"],
      ]),
    })
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)
    act(() => ref.current!.setColor("warning"))
    await act(async () => ref.current!.save())

    const loaded = await env.loadEnvironment(dir, "alpha")
    expect(Object.entries(loaded.vars)).toEqual([
      ["__proto__", "proto"],
      ["constructor", "ctor"],
      ["toString", "string"],
    ])
  })

  it("navigates to first and last row using browseFirst and browseLast", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    await act(async () => {
      ref.current!.enterBrowse()
    })
    await renderOnce()

    expect(ref.current!.editState.mode).toBe("browsing")

    // Go to last item (add row)
    await act(async () => {
      ref.current!.browseLast()
    })
    await renderOnce()
    expect(ref.current!.editState.addingRow).toBe(true)

    // Go to first item (row 0)
    await act(async () => {
      ref.current!.browseFirst()
    })
    await renderOnce()
    expect(ref.current!.editState.row).toBe(0)
    expect(ref.current!.editState.addingRow).toBe(false)
  })

  it("edits a keychain secret without dirtying it unchanged", async () => {
    setSecretBackendForTests(memoryBackend())
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { TOKEN: "keychain" },
    })
    await setStoredSecret(dirname(dir), "alpha", "TOKEN", "keychain-value")
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => ref.current!.activateVar(0, false, "value"))
    await renderOnce()
    expect(ref.current!.editValue).toBe("keychain-value")

    act(() => ref.current!.commitEdit())
    await renderOnce()
    expect(ref.current!.dirty).toBe(false)
    expect(ref.current!.draft!.varRows[0]!.valueChanged).toBeUndefined()

    act(() => ref.current!.activateVar(0, false, "value"))
    await renderOnce()
    act(() => ref.current!.setEditValue("updated-keychain-value"))
    await renderOnce()
    act(() => ref.current!.commitEdit())
    await renderOnce()
    expect(ref.current!.dirty).toBe(true)
    expect(ref.current!.draft!.varRows[0]!.valueChanged).toBe(true)

    await act(async () => ref.current!.save())
    await renderOnce()
    expect(await getStoredSecret(dirname(dir), "alpha", "TOKEN")).toBe(
      "updated-keychain-value",
    )
  })

  it("keeps active process-sourced secrets read-only", async () => {
    process.env.NOODLE_PROCESS_SECRET = "process-only"
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { NOODLE_PROCESS_SECRET: "process" },
    })
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => ref.current!.activateVar(0, false, "value"))
    await renderOnce()
    expect(ref.current!.editState.mode).toBe("inactive")

    act(() => ref.current!.enterBrowse())
    await renderOnce()
    act(() => ref.current!.enterEdit())
    await renderOnce()
    expect(ref.current!.editState.mode).toBe("browsing")
  })

  it("requires and records an explicit replacement when unmarking a process secret", async () => {
    setSecretBackendForTests(memoryBackend())
    process.env.NOODLE_PROCESS_SECRET = "process-only"
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { NOODLE_PROCESS_SECRET: "process" },
    })
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => {
      ref.current!.toggleSecret(0)
    })
    await renderOnce()
    expect(ref.current!.draft!.varRows[0]).toMatchObject({
      secret: false,
      originSecret: true,
    })
    expect(ref.current!.draft!.varRows[0]!.valueChanged).toBeUndefined()

    await act(async () => ref.current!.save())
    await renderOnce()
    expect(ref.current!.error).toBe(
      'Enter a plaintext value before unmarking "NOODLE_PROCESS_SECRET"',
    )
    expect(await readFile(join(dir, "alpha.env"), "utf8")).toContain(
      "# @secret NOODLE_PROCESS_SECRET",
    )

    act(() => {
      ref.current!.activateVar(0, false, "value")
    })
    await renderOnce()
    expect(ref.current!.editValue).toBe("process-only")

    act(() => {
      ref.current!.setEditValue("explicit-plaintext")
    })
    await renderOnce()
    act(() => {
      ref.current!.commitEdit()
    })
    await renderOnce()

    expect(ref.current!.draft!.varRows[0]).toMatchObject({
      value: "explicit-plaintext",
      valueChanged: true,
    })

    await act(async () => ref.current!.save())
    await renderOnce()
    expect(ref.current!.error).toBeNull()
    const saved = await readFile(join(dir, "alpha.env"), "utf8")
    expect(saved).toContain("NOODLE_PROCESS_SECRET=explicit-plaintext")
    expect(saved).not.toContain("# @secret NOODLE_PROCESS_SECRET")
  })

  it("restores an unsaved plaintext value after toggling secret off", async () => {
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => ref.current!.toggleSecret(0))
    await renderOnce()
    act(() => ref.current!.toggleSecret(0))
    await renderOnce()

    expect(ref.current!.draft!.varRows[0]).toMatchObject({
      secret: false,
      originSecret: false,
      value: "val",
    })
    act(() => ref.current!.activateVar(0, false, "value"))
    await renderOnce()
    expect(ref.current!.editValue).toBe("val")
  })

  it("moves a keychain secret to plaintext with one toggle", async () => {
    setSecretBackendForTests(memoryBackend())
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { TOKEN: "keychain" },
    })
    await setStoredSecret(dirname(dir), "alpha", "TOKEN", "keychain-value")
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => {
      ref.current!.toggleSecret(0)
    })
    await renderOnce()

    expect(ref.current!.draft!.varRows[0]!.secret).toBe(false)
    expect(ref.current!.draft!.varRows[0]!.valueChanged).toBeUndefined()

    await act(async () => {
      await ref.current!.save()
    })
    await renderOnce()
    expect(ref.current!.error).toBeNull()
    const saved = await readFile(join(dir, "alpha.env"), "utf8")
    expect(saved).toContain("TOKEN=keychain-value")
    expect(saved).not.toContain("# @secret TOKEN")
    expect(await getStoredSecret(dirname(dir), "alpha", "TOKEN")).toBeNull()
  })

  it("keeps a secret declared when keychain cleanup fails", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { TOKEN: "keychain" },
    })
    await setStoredSecret(dirname(dir), "alpha", "TOKEN", "keychain-value")
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => ref.current!.toggleSecret(0))
    await renderOnce()
    backend.failDelete = true
    await act(async () => {
      await ref.current!.save()
    })
    await renderOnce()

    expect(ref.current!.error).toContain("secret delete failed")
    expect(await readFile(join(dir, "alpha.env"), "utf8")).toContain(
      "# @secret TOKEN",
    )
    expect(await getStoredSecret(dirname(dir), "alpha", "TOKEN")).toBe(
      "keychain-value",
    )
  })

  it("reports rollback failures after an environment save fails", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    await env.saveEnvironment(dir, {
      name: "alpha",
      vars: {},
      secretVars: { TOKEN: "keychain" },
    })
    await setStoredSecret(dirname(dir), "alpha", "TOKEN", "keychain-value")
    const ref: { current: ReturnType<typeof useEnvironmentEditor> | null } = {
      current: null,
    }
    const { renderOnce } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness onEnvsChanged={() => {}} editorRef={ref} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await waitForDraft(ref, renderOnce)

    act(() => ref.current!.toggleSecret(0))
    await renderOnce()
    backend.failSet = true
    const saveSpy = spyOn(env, "saveEnvironment").mockRejectedValue(
      new Error("environment save unavailable"),
    )
    try {
      await act(async () => ref.current!.save())
      await renderOnce()
      expect(ref.current!.error).toContain("environment save unavailable")
      expect(ref.current!.error).toContain("rollback failed")
      expect(ref.current!.error).toContain("backend set unavailable")
    } finally {
      saveSpy.mockRestore()
    }
  })
})
