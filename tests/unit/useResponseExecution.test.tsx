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
