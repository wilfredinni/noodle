import { afterEach, describe, expect, it, jest } from "bun:test"
import {
  createScriptDiagnostics,
  type ScriptDiagnosticsRequest,
} from "../../src/ui/editor/scriptDiagnostics"
import type { ScriptDiagnostics } from "../../src/ui/editor/scriptSemanticChecker"

class FakeWorker extends EventTarget {
  onmessage?: (event: MessageEvent) => void
  onerror?: (event: ErrorEvent) => void
  requests: ScriptDiagnosticsRequest[] = []
  terminated = false
  postMessage(request: ScriptDiagnosticsRequest) {
    this.requests.push(request)
  }
  terminate() {
    this.terminated = true
  }
  reply(result: ScriptDiagnostics = { count: 0 }) {
    const request = this.requests.findLast(
      (request) => request.kind === "check",
    )!
    this.onmessage?.(
      new MessageEvent("message", {
        data: { id: request.kind === "check" ? request.id : -1, result },
      }),
    )
  }
}
afterEach(() => jest.useRealTimers())

describe("script diagnostics worker lifecycle", () => {
  it("starts lazily, coalesces queued edits, and clears completed source", async () => {
    const worker = new FakeWorker()
    const diagnostics = createScriptDiagnostics(
      () => worker as unknown as Worker,
    )
    try {
      expect(worker.requests).toHaveLength(0)
      expect(await diagnostics.check("", "pre")).toEqual({ count: 0 })
      const old = diagnostics.check("old", "pre")
      const skipped = diagnostics.check("middle", "post")
      const latest = diagnostics.check("latest", "tests")
      expect(await skipped).toEqual({ count: 0 })
      expect(worker.requests.filter((r) => r.kind === "check")).toHaveLength(1)
      worker.reply({
        count: 1,
        first: { code: 1, line: 1, column: 1, message: "old" },
      })
      expect((await old).count).toBe(1)
      expect(worker.requests.at(-1)).toMatchObject({
        kind: "check",
        source: "latest",
        phase: "tests",
      })
      worker.reply()
      expect(await latest).toEqual({ count: 0 })
      expect(worker.requests.at(-1)).toEqual({ kind: "clear" })
    } finally {
      diagnostics.dispose()
    }
    expect(worker.terminated).toBe(true)
    await expect(diagnostics.check("x", "pre")).rejects.toThrow(
      "Semantic validation unavailable",
    )
  })

  it("starts the new edit immediately when an aborted worker never replies", async () => {
    const workers: FakeWorker[] = []
    const diagnostics = createScriptDiagnostics(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    })
    try {
      const controller = new AbortController()
      const obsolete = diagnostics.check("slow", "pre", controller.signal)
      controller.abort()
      expect(await obsolete).toEqual({ count: 0 })
      expect(workers[0]!.terminated).toBe(true)
      const next = diagnostics.check("current", "post")
      expect(workers[1]!.requests.at(-1)).toMatchObject({
        kind: "check",
        source: "current",
      })
      workers[0]!.reply({ count: 1 })
      workers[1]!.reply()
      expect(await next).toEqual({ count: 0 })
    } finally {
      diagnostics.dispose()
    }
  })

  it("terminates timed-out analysis, ignores the old worker, and restarts on the next edit", async () => {
    jest.useFakeTimers()
    const workers: FakeWorker[] = []
    const diagnostics = createScriptDiagnostics(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    })
    try {
      const pending = diagnostics
        .check("slow", "pre")
        .catch((error: Error) => error.message)
      jest.advanceTimersByTime(5_000)
      expect(await pending).toBe("Semantic validation unavailable")
      expect(workers[0]?.terminated).toBe(true)
      const recovered = diagnostics.check("next", "post")
      workers[0]!.reply({ count: 8 })
      workers[1]!.reply()
      expect(await recovered).toEqual({ count: 0 })
    } finally {
      diagnostics.dispose()
    }
  })

  it.each(["error", "close", "throw"])(
    "handles worker %s without exposing internal details",
    async (failure) => {
      const worker = new FakeWorker()
      const diagnostics = createScriptDiagnostics(() => {
        if (failure === "throw") throw new Error("private path and source")
        return worker as unknown as Worker
      })
      try {
        const pending = diagnostics
          .check("x", "pre")
          .catch((error: Error) => error.message)
        if (failure === "close") worker.dispatchEvent(new Event("close"))
        if (failure === "error")
          worker.onerror?.(
            new ErrorEvent("error", {
              message: "private details",
              cancelable: true,
            }),
          )
        expect(await pending).toBe("Semantic validation unavailable")
      } finally {
        diagnostics.dispose()
      }
    },
  )

  it("does not start for cancelled or oversized input and cancels queued work on disposal", async () => {
    const worker = new FakeWorker()
    const diagnostics = createScriptDiagnostics(
      () => worker as unknown as Worker,
    )
    await expect(diagnostics.check(" ".repeat(262145), "pre")).rejects.toThrow(
      "256 KiB",
    )
    await diagnostics.check("x", "pre", AbortSignal.abort())
    expect(worker.requests).toHaveLength(0)
    const active = diagnostics.check("x", "pre").catch((error) => error.message)
    const queued = diagnostics
      .check("y", "post")
      .catch((error) => error.message)
    diagnostics.dispose()
    expect(await active).toBe("Semantic validation unavailable")
    expect(await queued).toBe("Semantic validation unavailable")
  })

  it("runs real worker analysis without executing script code", async () => {
    const diagnostics = createScriptDiagnostics()
    try {
      const result = await diagnostics.check(
        "while (true) {}\nprocess.exit(1)",
        "pre",
      )
      expect(result.first).toMatchObject({ line: 2, column: 1 })
      expect(
        await diagnostics.check(
          'const result = await noodle.runRequest("child"); result.json().id',
          "pre",
        ),
      ).toEqual({ count: 0 })
    } finally {
      diagnostics.dispose()
    }
  })
})
