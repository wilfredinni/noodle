import { describe, expect, it } from "bun:test"
import { act, useEffect, useState } from "react"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTestRender } from "../testRender"
import { useResponse } from "../../src/hooks/useResponse"
import { executor } from "../../src/requests"
import type { Environment, Request } from "../../src/schema"
import type { SendState } from "../../src/ui/sendState"
import { env } from "../../src/env"
import { buildTimelineEntry } from "../../src/timelineEntry"

const testRender = createTestRender()

function request(over: Partial<Request> = {}): Request {
  return {
    id: "first",
    name: "First",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: [],
    timeout: 0,
    ...over,
  }
}

describe("useResponse execution results", () => {
  it("reports the environment snapshot captured when the request started", async () => {
    const originalSend = executor.send
    let finishSend: (() => void) | undefined
    executor.send = () =>
      new Promise((resolve) => {
        finishSend = () =>
          resolve({
            status: 200,
            statusText: "OK",
            headers: {},
            body: "ok",
            timeMs: 1,
            network: [
              {
                timeMs: 0,
                type: "request",
                message: "GET https://a.example/secret-a",
              },
            ],
          })
      })
    const first: Environment = {
      name: "a",
      vars: { HOST: "a.example", TOKEN: "secret-a" },
      secretVars: { TOKEN: "keychain" },
    }
    const second: Environment = {
      name: "b",
      vars: { HOST: "b.example", TOKEN: "secret-b" },
      secretVars: { TOKEN: "keychain" },
    }
    let completedWith: Environment | undefined
    let timelineEntry: ReturnType<typeof buildTimelineEntry> | undefined

    function Harness() {
      const [environment, setEnvironment] = useState(first)
      const response = useResponse(
        request({ url: "https://$HOST/$TOKEN" }),
        environment,
        (completedRequest, result, dispatchEnvironment) => {
          completedWith = dispatchEnvironment
          timelineEntry = buildTimelineEntry(
            completedRequest,
            result,
            dispatchEnvironment?.name,
            dispatchEnvironment,
          )
        },
      )
      const [started, setStarted] = useState(false)
      useEffect(() => {
        if (!started && response.state.status === "idle") {
          response.trySend()
          setEnvironment(second)
          setStarted(true)
        }
      }, [response, started])
      return null
    }

    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      await act(async () => {
        await render.renderOnce()
        finishSend?.()
        await render.flush()
      })
      for (let i = 0; i < 5 && !completedWith; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(completedWith).toBe(first)
      expect(timelineEntry?.envName).toBe("a")
      expect(timelineEntry?.request.url).toBe("https://a.example/[REDACTED]")
      expect(timelineEntry?.network?.[0]?.message).toBe(
        "GET https://a.example/[REDACTED]",
      )
    } finally {
      executor.send = originalSend
    }
  })

  it("evaluates results and uses a fresh RunScope for every manual send", async () => {
    const originalSend = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: '{"token":"secret"}',
      timeMs: 1,
    })
    const states: { first?: SendState; final?: SendState } = {}
    function Harness() {
      const [selected, setSelected] = useState(
        request({
          captures: { token: { value: "body.token", enabled: true } },
        }),
      )
      const response = useResponse(selected)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0 && response.state.status === "idle") {
          response.trySend()
          setStep(1)
        } else if (step === 1 && response.state.status === "done") {
          states.first = response.state
          setSelected(
            request({
              id: "second",
              name: "Second",
              url: "https://example.com/$token",
            }),
          )
          setStep(2)
        } else if (step === 2 && response.state.status === "idle") {
          response.trySend()
          setStep(3)
        } else if (step === 3 && response.state.status === "error") {
          states.final = response.state
        }
      }, [response, step])
      return null
    }

    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      for (let i = 0; i < 10 && !states.final; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(states.first?.status).toBe("done")
      if (states.first?.status !== "done") throw new Error("narrow")
      expect(states.first.execution?.captures?.results[0]).toMatchObject({
        success: true,
        variable: "token",
        value: "secret",
      })
      expect(states.final?.status).toBe("error")
      if (states.final?.status !== "error") throw new Error("narrow")
      expect(states.final.error.message).toContain(
        'unresolved variable "token"',
      )
      expect(states.final.execution).toEqual({})
    } finally {
      executor.send = originalSend
    }
  })

  it("marks declarations not evaluated when sending fails", async () => {
    const originalSend = executor.send
    executor.send = async () => {
      throw new Error("offline")
    }
    const state: { final?: SendState } = {}
    function Harness() {
      const response = useResponse(
        request({
          assertions: [{ expression: "status", operator: "exists" }],
          captures: { token: { value: "body.token", enabled: true } },
        }),
      )
      useEffect(() => {
        if (response.state.status === "idle") response.trySend()
        else if (response.state.status === "error") state.final = response.state
      }, [response])
      return null
    }
    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      for (let i = 0; i < 5 && !state.final; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(state.final?.status).toBe("error")
      if (state.final?.status !== "error") throw new Error("narrow")
      expect(state.final.execution).toEqual({
        assertions: { evaluated: false, results: [] },
        captures: { evaluated: false, results: [] },
      })
    } finally {
      executor.send = originalSend
    }
  })

  it("keeps normal timeline substitution when preparation fails", async () => {
    const originalSend = executor.send
    let transportCalls = 0
    executor.send = async () => {
      transportCalls++
      throw new Error("transport should not run")
    }
    const environment: Environment = {
      name: "dev",
      vars: { HOST: "example.com" },
    }
    let timelineEntry: ReturnType<typeof buildTimelineEntry> | undefined
    function Harness() {
      const response = useResponse(
        request({ url: "https://$HOST/$MISSING" }),
        environment,
        (completedRequest, result, dispatchEnvironment, secrets, prepared) => {
          timelineEntry = buildTimelineEntry(
            completedRequest,
            result,
            dispatchEnvironment?.name,
            dispatchEnvironment,
            secrets,
            prepared,
          )
        },
      )
      useEffect(() => {
        if (response.state.status === "idle") response.trySend()
      }, [response])
      return null
    }

    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      for (let i = 0; i < 5 && !timelineEntry; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(transportCalls).toBe(0)
      expect(timelineEntry?.request.url).toBe("https://example.com/$MISSING")
    } finally {
      executor.send = originalSend
    }
  })

  it("uses the shared pre-script lifecycle for a manual send", async () => {
    const originalSend = executor.send
    let transportedUrl: string | undefined
    executor.send = async (prepared) => {
      transportedUrl = prepared.url
      expect(prepared.headers).toEqual({ "X-Manual": "yes" })
      expect(prepared).not.toHaveProperty("scripts")
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "ok",
        timeMs: 1,
      }
    }
    const observed: {
      state?: SendState
      completedRequest?: Request
    } = {}
    let resolveComplete: (() => void) | undefined
    const complete = new Promise<void>((resolve) => {
      resolveComplete = resolve
    })
    function Harness() {
      const response = useResponse(
        request({
          scripts: {
            pre: 'request.url = "https://manual.example/mutated"; request.headers.set("X-Manual", "yes"); console.info("ready")',
          },
        }),
        undefined,
        (completedRequest) => {
          observed.completedRequest = completedRequest
          resolveComplete?.()
        },
      )
      useEffect(() => {
        if (response.state.status === "idle") response.trySend()
        else if (response.state.status === "done")
          observed.state = response.state
      }, [response])
      return null
    }
    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      await act(async () => {
        await complete
        await render.flush()
      })
      expect(transportedUrl).toBe("https://manual.example/mutated")
      expect(observed.state?.status).toBe("done")
      if (observed.state?.status !== "done") throw new Error("narrow")
      expect(observed.state.execution?.scripts).toMatchObject({
        evaluated: true,
        results: [
          {
            success: true,
            logs: [{ level: "info", message: "ready" }],
          },
        ],
      })
      expect(observed.completedRequest?.url).toBe(
        "https://manual.example/mutated",
      )
      expect(observed.completedRequest).not.toHaveProperty("scripts")
    } finally {
      executor.send = originalSend
    }
  })

  it("redacts failed script secrets before manual error state", async () => {
    const originalSend = executor.send
    executor.send = async () => {
      throw new Error("transport should not run")
    }
    const observed: { state?: SendState } = {}
    function Harness() {
      const response = useResponse(
        request({
          scripts: {
            pre: 'request.auth.setBearer("manual-secret"); console.error("manual-secret"); const error = new Error("manual-secret"); error.name = "manual-secret"; throw error',
          },
        }),
      )
      useEffect(() => {
        if (response.state.status === "idle") response.trySend()
        else if (response.state.status === "error")
          observed.state = response.state
      }, [response])
      return null
    }

    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      for (let i = 0; i < 5 && !observed.state; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(observed.state?.status).toBe("error")
      if (observed.state?.status !== "error") throw new Error("narrow")
      expect(observed.state.error.name).toBe("ScriptRuntimeError")
      expect(observed.state.error.message).toBe("[REDACTED]")
      expect(observed.state.execution?.scripts?.results[0]).toMatchObject({
        success: false,
        logs: [{ level: "error", message: "[REDACTED]" }],
        error: { name: "ScriptRuntimeError", message: "[REDACTED]" },
      })
    } finally {
      executor.send = originalSend
    }
  })

  it("redacts script secrets from live and failed network events", async () => {
    const originalSend = executor.send
    let failTransport: (() => void) | undefined
    executor.send = (prepared, options) =>
      new Promise((_resolve, reject) => {
        const secret = new URL(prepared.url).pathname.slice(1)
        const network = [
          {
            timeMs: 1,
            type: "request" as const,
            message: `GET ${prepared.url}`,
          },
        ]
        options?.onNetworkEvent?.(network)
        failTransport = () =>
          reject(Object.assign(new Error(`offline ${secret}`), { network }))
      })
    const observed: { live?: string; final?: SendState } = {}
    function Harness() {
      const response = useResponse(
        request({
          scripts: {
            pre: 'request.url = "https://example.com/" + crypto.randomBytes(8, "hex")',
          },
        }),
      )
      useEffect(() => {
        if (response.state.status === "idle") response.trySend()
        else if (
          response.state.status === "sending" &&
          response.state.network.length > 0
        ) {
          observed.live = response.state.network[0]?.message
        } else if (response.state.status === "error") {
          observed.final = response.state
        }
      }, [response])
      return null
    }

    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      for (let i = 0; i < 5 && !observed.live; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(observed.live).toBe("GET https://example.com/[REDACTED]")
      await act(async () => {
        failTransport?.()
        await render.flush()
      })
      for (let i = 0; i < 5 && !observed.final; i++) {
        await act(async () => {
          await render.renderOnce()
          await render.flush()
        })
      }
      expect(observed.final?.status).toBe("error")
      if (observed.final?.status !== "error") throw new Error("narrow")
      expect(observed.final.error.message).toBe("offline [REDACTED]")
      expect(
        (observed.final.error as { network?: Array<{ message: string }> })
          .network?.[0]?.message,
      ).toBe("GET https://example.com/[REDACTED]")
    } finally {
      executor.send = originalSend
    }
  })

  it("keeps a completed send when the environment refresh fails", async () => {
    const collectionDir = await mkdtemp(
      join(tmpdir(), "noodle-manual-capture-"),
    )
    const environmentDir = join(collectionDir, ".environments")
    await writeFile(
      join(collectionDir, "settings.yml"),
      "environment: development\n",
    )
    await env.saveEnvironment(environmentDir, {
      name: "development",
      vars: {},
    })
    const activeEnvironment = await env.loadEnvironment(
      environmentDir,
      "development",
    )
    const originalSend = executor.send
    executor.send = async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      body: '{"token":"persisted"}',
      timeMs: 1,
    })
    const observed: {
      final?: SendState
      reloaded?: string
      reloadedBeforeComplete?: string
    } = {}
    let resolveComplete: (() => void) | undefined
    const complete = new Promise<void>((resolve) => {
      resolveComplete = resolve
    })

    function Harness() {
      const response = useResponse(
        request({
          captures: {
            token: {
              value: "body.token",
              enabled: true,
              persist: "environment",
            },
          },
        }),
        activeEnvironment,
        (_request, result) => {
          if (result.status === "done") {
            observed.reloadedBeforeComplete = observed.reloaded
          }
          resolveComplete?.()
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        collectionDir,
        async () => {
          observed.reloaded = (
            await env.loadEnvironment(environmentDir, "development")
          ).vars.token
          throw new Error("refresh failed")
        },
      )
      useEffect(() => {
        if (response.state.status === "idle") response.trySend()
        else if (
          response.state.status === "done" ||
          response.state.status === "error"
        )
          observed.final = response.state
      }, [response])
      return null
    }

    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      await act(async () => {
        await complete
        await render.flush()
      })
      expect(observed.reloaded).toBe("persisted")
      expect(observed.reloadedBeforeComplete).toBe("persisted")
      expect(observed.final?.status).toBe("done")
      if (observed.final?.status !== "done") throw new Error("narrow")
      expect(observed.final.execution?.captures?.results[0]).toMatchObject({
        success: true,
        persisted: "environment",
      })
    } finally {
      executor.send = originalSend
      await rm(collectionDir, { recursive: true, force: true })
    }
  })
})
