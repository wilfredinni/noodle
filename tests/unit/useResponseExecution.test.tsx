import { describe, expect, it } from "bun:test"
import { act, useEffect, useState } from "react"
import { createTestRender } from "../testRender"
import { useResponse } from "../../src/hooks/useResponse"
import { executor } from "../../src/requests"
import type { Request } from "../../src/schema"
import type { SendState } from "../../src/ui/sendState"

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
        request({ captures: { token: "body.token" } }),
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
          captures: { token: "body.token" },
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
})
