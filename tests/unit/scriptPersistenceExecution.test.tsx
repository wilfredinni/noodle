import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { act } from "react"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import {
  useResponse,
  type UseResponseResult,
} from "../../src/hooks/useResponse"
import {
  useEnvironments,
  type UseEnvironmentsResult,
} from "../../src/hooks/useEnvironments"
import {
  useEnvironmentEditor,
  type UseEnvironmentEditorResult,
} from "../../src/hooks/useEnvironmentEditor"
import {
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import { ThemeProvider } from "../../src/ui/theme"
import { ResponseResults } from "../../src/ui/ResponseResults"
import { env } from "../../src/env"
import { filestore } from "../../src/filestore"
import { lang } from "../../src/lang"
import { executor } from "../../src/requests"
import type { Request } from "../../src/schema"

const testRender = createTestRender()
let dir: string
let server: ReturnType<typeof Bun.serve>
const loadSpies: { mockRestore: () => void }[] = []
const environmentFile = () => join(dir, ".environments/dev.env")
const request = (scripts: Request["scripts"]): Request => ({
  id: "manual",
  name: "Manual",
  method: "GET",
  timeout: 0,
  url: `http://127.0.0.1:${server.port}/`,
  headers: {},
  params: [],
  scripts,
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-script-results-"))
  await mkdir(join(dir, ".environments"))
  await writeFile(environmentFile(), "HOST=original\n")
  await writeFile(join(dir, ".environments/prod.env"), "HOST=production\n")
  await writeFile(
    join(dir, "settings.yml"),
    "environment: dev\ncookies:\n  enabled: false\n",
  )
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => Response.json({ host: "capture" }),
  })
})
afterEach(async () => {
  for (const spy of loadSpies.splice(0)) spy.mockRestore()
  server.stop(true)
  await rm(dir, { recursive: true, force: true })
})

async function mountManual(req: Request) {
  let manual: UseResponseResult
  let environments: UseEnvironmentsResult
  let editor: UseEnvironmentEditorResult
  let pendingLoad: ReturnType<typeof env.loadEnvironment> | undefined
  const originalLoad = env.loadEnvironment
  const load = spyOn(env, "loadEnvironment").mockImplementation((...args) => {
    pendingLoad = originalLoad(...args)
    return pendingLoad
  })
  loadSpies.push(load)
  const complete = Promise.withResolvers<void>()
  const { keymap, host } = setupKeymap()
  keymap.setData("app.focus", "response")
  function Harness() {
    environments = useEnvironments(
      join(dir, ".environments"),
      ["dev", "prod"],
      "dev",
    )
    editor = useEnvironmentEditor({
      environmentsDir: join(dir, ".environments"),
      envNames: ["dev", "prod"],
      activeEnvName: environments.activeName ?? undefined,
      onEnvsChanged: () => {},
      onActiveEnvChanged: environments.select,
    })
    manual = useResponse(
      req,
      environments.activeEnv,
      () => complete.resolve(),
      undefined,
      undefined,
      { kind: "direct", source: "cli" },
      undefined,
      undefined,
      dir,
      environments.reloadActiveEnv,
    )
    return manual.state.status === "done" || manual.state.status === "error" ? (
      <ResponseResults execution={manual.state.execution} />
    ) : (
      <text>{manual.state.status}</text>
    )
  }
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 100, height: 26 },
  )
  await act(async () => {
    await pendingLoad
  })
  return {
    render,
    keymap,
    host,
    complete,
    pendingLoad: () => pendingLoad,
    manual: () => manual!,
    environments: () => environments!,
    editor: () => editor!,
  }
}

describe("script persistence Results and manual execution", () => {
  it("refreshes the active environment without changing dirty drafts or focus", async () => {
    const req = request({
      pre: 'run.set("HOST", "pre", { persist: "environment" })',
      post: 'run.set("HOST", "post", { persist: "environment" })',
    })
    req.captures = {
      HOST: { value: "body.host", persist: "environment", enabled: true },
    }
    const harness = await mountManual(req)
    await act(async () => harness.editor().openEditor("dev"))
    await act(async () => harness.editor().setName("dirty-dev"))
    expect(harness.editor().dirty).toBe(true)
    await act(async () => harness.manual().trySend())
    await act(async () => harness.complete.promise)
    await harness.render.renderOnce()
    expect(harness.environments().activeEnv?.vars.HOST).toBe("post")
    expect(harness.editor().draft?.name).toBe("dirty-dev")
    expect(harness.editor().dirty).toBe(true)
    expect(harness.keymap.getData("app.focus")).toBe("response")
    expect(harness.render.captureCharFrame()).toMatch(/PASS\s+Pre-request/)
    expect(harness.render.captureCharFrame()).toContain("1 saved")
    await act(async () => harness.host.press("return"))
    await harness.render.renderOnce()
    expect(harness.render.captureCharFrame()).toContain(
      "set HOST (environment): saved",
    )
    expect(harness.manual().state.status).toBe("done")
  })

  it("refreshes a successful pre save even after a transport failure", async () => {
    const req = request({
      pre: 'run.set("HOST", "pre", { persist: "environment" })',
    })
    server.stop(true)
    const harness = await mountManual(req)
    await act(async () => harness.manual().trySend())
    await act(async () => harness.complete.promise)
    await harness.render.renderOnce()
    expect(harness.manual().state.status).toBe("error")
    expect(harness.environments().activeEnv?.vars.HOST).toBe("pre")
    expect(await readFile(environmentFile(), "utf8")).toContain("HOST=pre")
    expect(harness.render.captureCharFrame()).toContain("1 saved")
  })

  it("retains and refreshes pre persistence when the manual send is canceled", async () => {
    const entered = Promise.withResolvers<void>()
    const response = Promise.withResolvers<Response>()
    server.reload({
      fetch: () => {
        entered.resolve()
        return response.promise
      },
    })
    const req = request({
      pre: 'run.set("HOST", "before-cancel", { persist: "environment" })',
    })
    const harness = await mountManual(req)
    let pendingSend: ReturnType<typeof executor.send> | undefined
    const originalSend = executor.send
    const send = spyOn(executor, "send").mockImplementation((...args) => {
      pendingSend = originalSend(...args)
      return pendingSend
    })
    try {
      await act(async () => harness.manual().trySend())
      await act(async () => entered.promise)
      await act(async () => {
        harness.manual().cancelSend()
        await pendingSend?.catch(() => {})
      })
      expect(harness.manual().state.status).toBe("idle")
      expect(harness.environments().activeEnv?.vars.HOST).toBe("before-cancel")
      expect(await readFile(environmentFile(), "utf8")).toContain(
        "HOST=before-cancel",
      )
    } finally {
      response.resolve(new Response("stopped"))
      send.mockRestore()
    }
  })

  it("does not reload an old environment after selection changes during storage", async () => {
    const req = request({
      pre: 'run.set("HOST", "saved-dev", { persist: "environment" })',
    })
    const harness = await mountManual(req)
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const originalSave = env.saveEnvironment
    const save = spyOn(env, "saveEnvironment").mockImplementation(
      async (...args) => {
        entered.resolve()
        await resume.promise
        return originalSave(...args)
      },
    )
    try {
      await act(async () => harness.manual().trySend())
      await act(async () => entered.promise)
      await act(async () => harness.environments().select("prod"))
      await act(async () => {
        await harness.pendingLoad()
      })
      resume.resolve()
      await act(async () => harness.complete.promise)
      expect(harness.environments().activeName).toBe("prod")
      expect(harness.environments().activeEnv?.vars.HOST).toBe("production")
      expect(await readFile(environmentFile(), "utf8")).toContain(
        "HOST=saved-dev",
      )
    } finally {
      resume.resolve()
      save.mockRestore()
    }
  })

  it("renders persistence failure separately from passed VM execution", async () => {
    const req = request({
      pre: 'run.set("HOST", "runtime", { persist: "environment" })',
    })
    let manual: UseResponseResult
    const complete = Promise.withResolvers<void>()
    const { keymap, host } = setupKeymap()
    function Harness() {
      manual = useResponse(
        req,
        undefined,
        () => complete.resolve(),
        undefined,
        undefined,
        { kind: "direct", source: "cli" },
      )
      return manual.state.status === "done" ? (
        <ResponseResults execution={manual.state.execution} />
      ) : null
    }
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await act(async () => manual!.trySend())
    await act(async () => complete.promise)
    await render.renderOnce()
    expect(render.captureCharFrame()).toMatch(/FAIL\s+Pre-request/)
    expect(render.captureCharFrame()).toContain("persistence failed")
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("Execution")
    expect(render.captureCharFrame()).toContain("Passed")
    expect(render.captureCharFrame()).toContain("no active environment")
    if (process.env.NOODLE_TEST_SHOW_FRAMES)
      console.log(render.captureCharFrame())
  })

  it("renders transient runner writes without changing environment storage", async () => {
    const req = request({
      post: 'run.set("HOST", "runtime", { persist: "environment" }); run.set("TOKEN", "runner-secret", { persist: "secret" }); console.log("runner-secret")',
    })
    await writeFile(join(dir, "manual.yml"), lang.serializeRequest(req))
    const collection = await filestore.loadCollection(dir)
    const before = await readFile(environmentFile(), "utf8")
    let runner: UseCollectionRunnerResult
    function Harness() {
      runner = useCollectionRunner({
        collection,
        collectionDir: dir,
        folderPath: null,
        activeEnvironment: "dev",
        environmentNames: ["dev"],
        hasUnsavedChanges: false,
        noProxy: true,
        systemProxy: { bypass: [] },
        insecure: false,
        resetKey: 0,
      })
      return runner.result?.results[0] ? (
        <ResponseResults execution={runner.result.results[0]} />
      ) : null
    }
    const { keymap, host } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await act(async () => runner!.run())
    await render.renderOnce()
    expect(runner!.result?.failed).toBe(false)
    expect(render.captureCharFrame()).toContain("2 transient")
    await act(async () => host.press("return"))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("set TOKEN (secret): transient")
    expect(render.captureCharFrame()).toContain("[REDACTED]")
    expect(render.captureCharFrame()).not.toContain("runner-secret")
    expect(await readFile(environmentFile(), "utf8")).toBe(before)
  })
})
