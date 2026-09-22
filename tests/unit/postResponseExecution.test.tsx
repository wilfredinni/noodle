import { describe, expect, it } from "bun:test"
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
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import { ThemeProvider } from "../../src/ui/theme"
import { ResponseResults } from "../../src/ui/ResponseResults"
import { lang } from "../../src/lang"
import { filestore } from "../../src/filestore"
import type { Request } from "../../src/schema"
import { findRequestById } from "../../src/ui/tree"
import { buildTimelineEntry } from "../../src/timelineEntry"

const testRender = createTestRender()

describe("rendered post-response parity", () => {
  it("runs the shipped chaining examples through manual sends and the Runner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-async-examples-"))
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) => {
        const path = new URL(req.url).pathname
        if (path === "/posts/0") return new Response("{}", { status: 404 })
        if (path === "/posts/1") return Response.json({ id: 1, userId: 7 })
        if (path === "/users/7") return Response.json({ username: "test-user" })
        return new Response("unexpected route", { status: 500 })
      },
    })
    try {
      await mkdir(join(dir, "async-scripting"))
      await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
      for (const name of ["folder", "get-post", "use-post"]) {
        const source = await readFile(
          new URL(
            `../../collections/async-scripting/${name}.yml`,
            import.meta.url,
          ),
          "utf8",
        )
        await writeFile(
          join(dir, "async-scripting", `${name}.yml`),
          source.replaceAll(
            "https://jsonplaceholder.typicode.com",
            `http://127.0.0.1:${server.port}`,
          ),
        )
      }
      const collection = await filestore.loadCollection(dir)
      const request = findRequestById(
        collection.items,
        "async-scripting/use-post",
      )!
      const complete = Promise.withResolvers<void>()
      let manual: UseResponseResult
      let runner: UseCollectionRunnerResult
      let history: ReturnType<typeof buildTimelineEntry> | undefined
      let completed = 0
      function Harness() {
        manual = useResponse(
          request,
          undefined,
          (req, result, env, secrets, prepared) => {
            completed++
            history = buildTimelineEntry(
              req,
              result,
              env?.name,
              env,
              secrets,
              prepared,
            )
            complete.resolve()
          },
          collection,
          request.id,
          { kind: "direct", source: "cli" },
        )
        runner = useCollectionRunner({
          collection,
          collectionDir: dir,
          folderPath: null,
          activeEnvironment: null,
          environmentNames: [],
          hasUnsavedChanges: false,
          noProxy: true,
          systemProxy: { bypass: [] },
          insecure: false,
          resetKey: 0,
        })
        const execution =
          runner.result?.results.find((result) => result.id === request.id) ??
          (manual.state.status === "done" ? manual.state.execution : undefined)
        return <ResponseResults execution={execution} />
      }
      const { keymap, host } = setupKeymap()
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 30 },
      )
      await act(async () => manual!.trySend())
      await act(async () => complete.promise)
      await render.renderOnce()
      expect(manual!.state.status).toBe("done")
      expect(completed).toBe(1)
      expect(history?.scripts?.results[0]?.requests).toHaveLength(2)
      expect(history?.scripts?.results[1]?.requests?.[0]?.status).toBe(404)
      expect(JSON.stringify(history?.scripts)).not.toContain("test-user")
      expect(render.captureCharFrame()).toContain("2 calls")
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("async-scripting/get-post")
      await act(async () => runner!.run())
      await render.renderOnce()
      expect(runner!.result?.failed).toBe(false)
      expect(runner!.result?.results).toHaveLength(2)
      expect(render.captureCharFrame()).toContain("2 calls")
      expect(completed).toBe(1)
    } finally {
      server.stop(true)
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("preserves manual response diagnostics and existing Results navigation", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) =>
        Response.json({ id: 7, generated: req.headers.get("X-Random") }),
    })
    const request: Request = {
      id: "manual",
      name: "Manual",
      method: "GET",
      url: `http://127.0.0.1:${server.port}/`,
      headers: {},
      params: [],
      timeout: 0,
      scripts: {
        pre: `noodle.random.seed(42); noodle.run.set("generated", noodle.random.uuid()); noodle.request.headers.set("X-Random", noodle.run.get("generated")); console.info("pre log")`,
        post: `if (noodle.run.get("id") !== 7) throw Error("capture order"); if (noodle.response.json().generated !== noodle.run.get("generated")) throw Error("random body"); console.warn("post log"); console.log(noodle.random.password());\nthrow Error("post failed")`,
      },
      captures: { id: { value: "body.id", enabled: true } },
      assertions: [{ expression: "status", operator: "equals", value: 200 }],
    }
    const completed = Promise.withResolvers<void>()
    let manual: UseResponseResult
    const { keymap, host } = setupKeymap()
    function Harness() {
      manual = useResponse(
        request,
        undefined,
        () => completed.resolve(),
        undefined,
        undefined,
        { kind: "direct", source: "cli" },
      )
      return manual.state.status === "done" ? (
        <ResponseResults execution={manual.state.execution} />
      ) : (
        <text>{manual.state.status}</text>
      )
    }
    try {
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 65, height: 24 },
      )
      await act(async () => manual!.trySend())
      await act(async () => completed.promise)
      await render.renderOnce()
      expect(manual!.state.status).toBe("done")
      const frame = render.captureCharFrame()
      expect(frame).toContain("Pre-request")
      expect(frame).toContain("Post-response")
      expect(frame.indexOf("Pre-request")).toBeLessThan(
        frame.indexOf("Post-response"),
      )
      expect(frame).toContain("1 passed")
      expect(frame).toContain("1 captured")
      await act(async () => host.press("down"))
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("post-response.js:2")
      expect(render.captureCharFrame()).toContain("post log")
      expect(render.captureCharFrame()).toContain("[REDACTED]")
      expect(render.captureCharFrame()).not.toContain("pre log")
    } finally {
      server.stop(true)
    }
  })

  it("runs the real Runner lifecycle and renders its post diagnostics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-post-runner-"))
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) =>
        Response.json({ id: 7, generated: req.headers.get("X-Random") }),
    })
    try {
      await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
      await writeFile(
        join(dir, "first.yml"),
        lang.serializeRequest({
          id: "first",
          name: "First",
          method: "GET",
          url: `http://127.0.0.1:${server.port}/`,
          headers: {},
          params: [],
          timeout: 0,
          scripts: {
            pre: `noodle.random.seed(42); noodle.run.set("generated", noodle.random.uuid()); noodle.request.headers.set("X-Random", noodle.run.get("generated"));`,
            post: `if (noodle.response.json().generated !== noodle.run.get("generated")) throw Error("runner random data"); noodle.run.set("id", noodle.response.json().id); console.info("runner log"); console.log(noodle.random.password());`,
          },
        }),
      )
      const collection = await filestore.loadCollection(dir)
      let runner: UseCollectionRunnerResult
      function Harness() {
        runner = useCollectionRunner({
          collection,
          collectionDir: dir,
          folderPath: null,
          activeEnvironment: null,
          environmentNames: [],
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
        { width: 60, height: 18 },
      )
      await act(async () => runner!.run())
      await render.renderOnce()
      expect(runner!.phase).toBe("results")
      expect(runner!.result?.results[0]?.ok).toBe(true)
      expect(render.captureCharFrame()).toMatch(/PASS\s+Post-response/)
      await act(async () => host.press("down"))
      await act(async () => host.press("return"))
      await render.renderOnce()
      expect(render.captureCharFrame()).toContain("runner log")
      expect(render.captureCharFrame()).toContain("[REDACTED]")
    } finally {
      server.stop(true)
      await rm(dir, { recursive: true, force: true })
    }
  })
})
