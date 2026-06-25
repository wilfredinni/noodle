import { describe, it, expect } from "bun:test"
import type { Request, Response } from "../src/schema"
import {
  startSend,
  finishSend,
  failSend,
  type SendState,
} from "../src/ui/sendState"

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "x",
    name: "X",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: {},
    auth: { type: "none" },
    ...over,
  }
}

function makeRes(over: Partial<Response> = {}): Response {
  return {
    status: 200,
    statusText: "OK",
    headers: {},
    body: "",
    timeMs: 5,
    ...over,
  }
}

describe("startSend", () => {
  it("transitions idle → sending", () => {
    const idle: SendState = { status: "idle" }
    const next = startSend(idle, makeReq())
    expect(next.status).toBe("sending")
    if (next.status !== "sending") throw new Error("narrow")
    expect(next.request).toEqual(makeReq())
  })

  it("transitions done → sending (re-send works)", () => {
    const done: SendState = {
      status: "done",
      response: makeRes({ status: 200 }),
    }
    const next = startSend(done, makeReq({ method: "POST" }))
    expect(next.status).toBe("sending")
    if (next.status !== "sending") throw new Error("narrow")
    expect(next.request.method).toBe("POST")
  })

  it("transitions error → sending", () => {
    const err: SendState = {
      status: "error",
      request: makeReq(),
      error: new Error("boom"),
    }
    const next = startSend(err, makeReq())
    expect(next.status).toBe("sending")
  })

  it("is a no-op when already sending (returns same reference)", () => {
    const sending: SendState = { status: "sending", request: makeReq() }
    const next = startSend(sending, makeReq())
    expect(next).toBe(sending)
  })
})

describe("finishSend", () => {
  it("transitions to done with response", () => {
    const sending: SendState = { status: "sending", request: makeReq() }
    const res = makeRes({ status: 201, statusText: "Created" })
    const next = finishSend(sending, makeReq(), res)
    expect(next.status).toBe("done")
    if (next.status !== "done") throw new Error("narrow")
    expect(next.response.status).toBe(201)
    expect(next.response.statusText).toBe("Created")
  })
})

describe("failSend", () => {
  it("transitions to error with request and error", () => {
    const sending: SendState = { status: "sending", request: makeReq() }
    const err = new Error("fetch failed")
    const next = failSend(sending, makeReq(), err)
    expect(next.status).toBe("error")
    if (next.status !== "error") throw new Error("narrow")
    expect(next.request).toEqual(makeReq())
    expect(next.error).toBe(err)
  })
})

describe("immutability", () => {
  it("startSend does not mutate input state", () => {
    const idle: SendState = { status: "idle" }
    startSend(idle, makeReq())
    expect(idle.status).toBe("idle")
  })
  it("finishSend does not mutate input state", () => {
    const sending: SendState = { status: "sending", request: makeReq() }
    finishSend(sending, makeReq(), makeRes())
    expect(sending.status).toBe("sending")
  })
})
