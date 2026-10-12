import { describe, expect, it } from "bun:test"
import { act, useEffect, useState } from "react"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTestRender, waitForHookState } from "../testRender"
import {
  useResponse,
  type UseResponseResult,
  type SendCompleteResult,
} from "../../src/hooks/useResponse"
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
  for (const newerFirst of [false, true]) {
    for (const oldOutcome of ["done", "error"] as const) {
      for (const sameRequest of [false, true]) {
        it(`keeps overlapping ${sameRequest ? "same-request" : "different-request"} results ordered when the older send ${oldOutcome === "done" ? "succeeds" : "fails"} ${newerFirst ? "last" : "first"}`, async () => {
          const originalSend = executor.send
          const pending = [
            Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>(),
            Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>(),
          ]
          const started = [
            Promise.withResolvers<void>(),
            Promise.withResolvers<void>(),
          ]
          let calls = 0
          executor.send = () => {
            const index = calls++
            started[index]!.resolve()
            return pending[index]!.promise
          }
          const first = request()
          const second = sameRequest ? first : request({ id: "second" })
          let manual!: UseResponseResult
          let select!: (req: Request | null) => void
          const completed: {
            id: string
            status: SendCompleteResult["status"]
          }[] = []
          function Harness() {
            const [selected, setSelected] = useState<Request | null>(first)
            select = setSelected
            manual = useResponse(selected, undefined, (req, result) => {
              completed.push({ id: req.id, status: result.status })
            })
            return null
          }
          try {
            const render = await act(async () =>
              testRender(<Harness />, { width: 10, height: 3 }),
            )
            await act(async () => manual.trySend())
            await act(async () => started[0]!.promise)
            await act(async () => select(null))
            await act(async () => select(second))
            await act(async () => manual.trySend())
            await act(async () => started[1]!.promise)
            const finish = async (index: number) => {
              await act(async () => {
                if (index === 0 && oldOutcome === "error")
                  pending[0]!.reject(new Error("older offline"))
                else
                  pending[index]!.resolve({
                    status: 200,
                    statusText: "OK",
                    headers: {},
                    body: index === 0 ? "older" : "newer",
                    timeMs: 1,
                  })
                await pending[index]!.promise.catch(() => {})
                await render.flush()
              })
              await waitForHookState(
                render,
                () =>
                  completed.length === (index === (newerFirst ? 1 : 0) ? 1 : 2),
              )
            }
            await finish(newerFirst ? 1 : 0)
            expect(manual.state).toMatchObject(
              newerFirst
                ? { status: "done", response: { body: "newer" } }
                : { status: "sending", request: { id: second.id } },
            )
            await finish(newerFirst ? 0 : 1)
            expect(manual.state).toMatchObject({
              status: "done",
              response: { body: "newer" },
            })
            await act(async () => select(null))
            await act(async () => select(second))
            expect(manual.state).toMatchObject({
              status: "done",
              response: { body: "newer" },
            })
            expect(completed).toHaveLength(2)
            if (!sameRequest) {
              await act(async () => select(first))
              expect(manual.state).toMatchObject(
                oldOutcome === "done"
                  ? { status: "done", response: { body: "older" } }
                  : { status: "error", error: { message: "older offline" } },
              )
            }
          } finally {
            await act(async () => {
              manual?.cancelSend()
              for (const deferred of pending)
                deferred.resolve({
                  status: 200,
                  statusText: "OK",
                  headers: {},
                  body: "cleanup",
                  timeMs: 1,
                })
              await Promise.allSettled(pending.map(({ promise }) => promise))
            })
            executor.send = originalSend
          }
        })
      }
    }
  }

  for (const secondFinishesFirst of [false, true]) {
    it(`shows the selected first request while another send owns cancellation and finishes ${secondFinishesFirst ? "first" : "last"}`, async () => {
      const originalSend = executor.send
      const pending = [
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>(),
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>(),
      ]
      const started = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ]
      let calls = 0
      executor.send = () => {
        const index = calls++
        started[index]!.resolve()
        return pending[index]!.promise
      }
      const first = request()
      let manual!: UseResponseResult
      let select!: (req: Request | null) => void
      const completed: string[] = []
      function Harness() {
        const [selected, setSelected] = useState<Request | null>(first)
        select = setSelected
        manual = useResponse(selected, undefined, (req) => {
          completed.push(req.id)
        })
        return null
      }
      try {
        const render = await act(async () =>
          testRender(<Harness />, { width: 10, height: 3 }),
        )
        await act(async () => manual.trySend())
        await act(async () => started[0]!.promise)
        await act(async () => select(request({ id: "second" })))
        await act(async () => manual.trySend())
        await act(async () => started[1]!.promise)
        await act(async () => select(first))
        for (const index of secondFinishesFirst ? [1, 0] : [0, 1]) {
          await act(async () => {
            pending[index]!.resolve({
              status: 200,
              statusText: "OK",
              headers: {},
              body: index === 0 ? "first response" : "second response",
              timeMs: 1,
            })
            await pending[index]!.promise
            await render.flush()
          })
          await waitForHookState(
            render,
            () =>
              completed.length ===
              (index === (secondFinishesFirst ? 1 : 0) ? 1 : 2),
          )
          if (index === 0 || completed.length === 2)
            expect(manual.state).toMatchObject({
              status: "done",
              requestId: "first",
              response: { body: "first response" },
            })
          else expect(manual.state.status).toBe("idle")
        }
      } finally {
        await act(async () => {
          manual?.cancelSend()
          for (const deferred of pending)
            deferred.resolve({
              status: 200,
              statusText: "OK",
              headers: {},
              body: "cleanup",
              timeMs: 1,
            })
          await Promise.allSettled(pending.map(({ promise }) => promise))
        })
        executor.send = originalSend
      }
    })
  }

  for (const returnBeforeCompletion of [true, false]) {
    it(`shows the active response only for the selected request ${returnBeforeCompletion ? "after returning before completion" : "after returning to its cache"}`, async () => {
      const originalSend = executor.send
      const started = Promise.withResolvers<void>()
      const pending =
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>()
      executor.send = () => {
        started.resolve()
        return pending.promise
      }
      const req = request()
      let manual!: UseResponseResult
      let select!: (req: Request | null) => void
      const completed: string[] = []
      function Harness() {
        const [selected, setSelected] = useState<Request | null>(req)
        select = setSelected
        manual = useResponse(selected, undefined, (req) =>
          completed.push(req.id),
        )
        return null
      }
      try {
        const render = await act(async () =>
          testRender(<Harness />, { width: 10, height: 3 }),
        )
        await act(async () => manual.trySend())
        await act(async () => started.promise)
        await act(async () => select(request({ id: "second" })))
        if (returnBeforeCompletion) await act(async () => select(req))
        await act(async () => {
          pending.resolve({
            status: 200,
            statusText: "OK",
            headers: {},
            body: "completed first",
            timeMs: 1,
          })
          await pending.promise
          await render.flush()
        })
        await waitForHookState(render, () => completed.length === 1)
        expect(manual.state.status).toBe(
          returnBeforeCompletion ? "done" : "idle",
        )
        if (!returnBeforeCompletion) await act(async () => select(req))
        expect(manual.state).toMatchObject({
          status: "done",
          requestId: "first",
          response: { body: "completed first" },
        })
        expect(completed).toEqual(["first"])
      } finally {
        await act(async () => {
          manual?.cancelSend()
          pending.resolve({
            status: 200,
            statusText: "OK",
            headers: {},
            body: "cleanup",
            timeMs: 1,
          })
          await pending.promise
        })
        executor.send = originalSend
      }
    })
  }

  it("retains, reports and caches the response when post-script cancellation interrupts a child", async () => {
    const originalSend = executor.send
    const entered = Promise.withResolvers<void>()
    let child: ReturnType<typeof executor.send> | undefined
    let calls = 0
    executor.send = async (_req, options) => {
      if (++calls === 1)
        return {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "retained",
          timeMs: 1,
        }
      child = new Promise((_resolve, reject) => {
        options!.signal!.addEventListener(
          "abort",
          () => reject(options!.signal!.reason),
          { once: true },
        )
        entered.resolve()
      })
      return child
    }
    const req = request({
      scripts: {
        post: 'console.log("before"); await noodle.sendRequest({url: "https://example.com/child"})',
      },
    })
    let manual!: UseResponseResult
    let select!: (req: Request | null) => void
    const completed: SendCompleteResult[] = []
    function Harness() {
      const [selected, setSelected] = useState<Request | null>(req)
      select = setSelected
      manual = useResponse(selected, undefined, (_req, result) =>
        completed.push(result),
      )
      return null
    }
    try {
      const render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      await act(async () => manual.trySend())
      await act(async () => entered.promise)
      await act(async () => {
        manual.cancelSend()
        await child?.catch(() => {})
      })
      await waitForHookState(render, () => manual.state.status !== "sending")
      expect(manual.state.status).toBe("done")
      if (manual.state.status !== "done") throw new Error("narrow")
      expect(manual.state.response.body).toBe("retained")
      expect(manual.state.execution?.scripts?.results[0]).toMatchObject({
        cancelled: true,
        logs: [{ message: "before" }],
      })
      expect(completed).toMatchObject([
        {
          status: "done",
          response: { body: "retained" },
          execution: manual.state.execution,
        },
      ])
      await act(async () => select(request({ id: "second" })))
      await act(async () => select(req))
      expect(manual.state.status).toBe("done")
      expect(calls).toBe(2)
    } finally {
      await act(async () => {
        manual?.cancelSend()
        await child?.catch(() => {})
      })
      executor.send = originalSend
    }
  })

  for (const sameRequest of [false, true]) {
    it(`keeps a newer ${sameRequest ? "same-request" : "different-request"} send active after a late cancellation`, async () => {
      const originalSend = executor.send
      const first =
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>()
      const second =
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>()
      const started = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ]
      let calls = 0
      let secondSignal: AbortSignal | undefined
      executor.send = (_req, options) => {
        const index = calls++
        if (index === 1) secondSignal = options?.signal
        started[index]!.resolve()
        return index === 0 ? first.promise : second.promise
      }
      const req = request()
      let manual!: UseResponseResult
      let select!: (req: Request | null) => void
      function Harness() {
        const [selected, setSelected] = useState<Request | null>(req)
        select = setSelected
        manual = useResponse(selected)
        return null
      }
      try {
        const render = await act(async () =>
          testRender(<Harness />, { width: 10, height: 3 }),
        )
        await act(async () => manual.trySend())
        await act(async () => started[0]!.promise)
        await act(async () => {
          manual.cancelSend()
          select(null)
        })
        await act(async () =>
          select(sameRequest ? req : request({ id: "second" })),
        )
        await act(async () => manual.trySend())
        await act(async () => started[1]!.promise)
        await act(async () => {
          first.reject(new DOMException("cancelled", "AbortError"))
          await first.promise.catch(() => {})
          await render.flush()
        })
        const stateAfterCancellation = manual.state
        await act(async () => {
          manual.cancelSend()
          second.reject(new DOMException("cancelled", "AbortError"))
          await second.promise.catch(() => {})
          await render.flush()
        })
        expect(stateAfterCancellation.status).toBe("sending")
        expect(secondSignal?.aborted).toBe(true)
      } finally {
        await act(async () => {
          manual?.cancelSend()
          const response = {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "cleanup",
            timeMs: 1,
          }
          first.resolve(response)
          second.resolve(response)
          await Promise.allSettled([first.promise, second.promise])
        })
        executor.send = originalSend
      }
    })
  }

  it("reports the environment snapshot captured when the request started", async () => {
    const originalSend = executor.send
    const startedSend = Promise.withResolvers<void>()
    const complete = Promise.withResolvers<void>()
    let finishSend: (() => void) | undefined
    executor.send = () =>
      new Promise((resolve) => {
        startedSend.resolve()
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
          complete.resolve()
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
        await startedSend.promise
        finishSend!()
        await complete.promise
        await render.flush()
      })
      await waitForHookState(render, () => !!completedWith)
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
      await waitForHookState(render, () => !!states.final)
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
      await waitForHookState(render, () => !!state.final)
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
      await waitForHookState(render, () => !!timelineEntry)
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
            pre: 'noodle.request.url = "https://manual.example/mutated"; noodle.request.headers.set("X-Manual", "yes"); console.info("ready")',
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
            pre: 'noodle.request.auth.setBearer("manual-secret"); console.error("manual-secret"); const error = new Error("manual-secret"); error.name = "manual-secret"; throw error',
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
      await waitForHookState(render, () => !!observed.state)
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
            pre: 'noodle.request.url = "https://example.com/" + noodle.crypto.randomBytes(8, "hex")',
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
      await waitForHookState(render, () => !!observed.live)
      expect(observed.live).toBe("GET https://example.com/[REDACTED]")
      await act(async () => {
        failTransport?.()
        await render.flush()
      })
      await waitForHookState(render, () => !!observed.final)
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
