import { afterEach, describe, expect, it, jest } from "bun:test"
import {
  createScriptDiagnostics,
  type ScriptDiagnosticsRequest,
} from "../../src/ui/editor/scriptDiagnostics"

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
  reply(result: unknown = { count: 0 }) {
    const request = this.requests.findLast((request) => "id" in request)!
    this.onmessage?.(
      new MessageEvent("message", {
        data: { id: "id" in request ? request.id : -1, result },
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

  it("keeps a warm worker for superseded edits and still dispatches the latest source", async () => {
    const worker = new FakeWorker()
    const diagnostics = createScriptDiagnostics(
      () => worker as unknown as Worker,
    )
    try {
      const controller = new AbortController()
      const obsolete = diagnostics.check("old", "pre", controller.signal)
      controller.abort()
      expect(await obsolete).toEqual({ count: 0 })
      expect(worker.terminated).toBe(false)
      const next = diagnostics.check("current", "post")
      worker.reply({ count: 1 })
      expect(worker.requests.at(-1)).toMatchObject({
        kind: "check",
        source: "current",
      })
      worker.reply()
      expect(await next).toEqual({ count: 0 })
      expect(
        worker.requests.filter((request) => request.kind === "init"),
      ).toHaveLength(1)
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

  it("prioritizes latest assistance, retains an editing session, and clears on release", async () => {
    const worker = new FakeWorker()
    const service = createScriptDiagnostics(() => worker as unknown as Worker)
    const release = service.retain()
    const names = { environmentKeys: ["TOKEN"], requestIds: [] }
    try {
      const initial = service.check("start", "pre")
      const diagnostic = service.check("latest", "pre")
      const obsolete = service.assist("old", "pre", 3, names)
      const current = service.assist("noodle.", "post", 7, names)
      expect(await obsolete).toEqual({ items: [], query: "" })
      worker.reply()
      await initial
      expect(worker.requests.at(-1)).toMatchObject({
        kind: "assist",
        source: "noodle.",
        phase: "post",
        cursor: 7,
        context: names,
      })
      worker.reply({ items: [], query: "" })
      await current
      expect(worker.requests.at(-1)).toMatchObject({
        kind: "check",
        source: "latest",
      })
      worker.reply()
      await diagnostic
      expect(worker.requests.at(-1)?.kind).toBe("check")
      release()
      expect(worker.requests.at(-1)).toEqual({ kind: "clear" })
    } finally {
      release()
      service.dispose()
    }
  })

  it("isolates completion documents, cancellation and phases in a real worker", async () => {
    const service = createScriptDiagnostics()
    const context = { environmentKeys: ["TOKEN"], requestIds: ["saved"] }
    const release = service.retain()
    try {
      const source = "const local = { unique: 1 }; local."
      expect(
        (await service.assist(source, "pre", source.length, context)).items.map(
          (x) => x.label,
        ),
      ).toContain("unique")
      expect((await service.assist("local.", "pre", 6, context)).items).toEqual(
        [],
      )
      expect(
        (await service.assist("noodle.run.", "tests", 11, context)).items.map(
          (x) => x.label,
        ),
      ).toEqual(["get"])
      expect(
        await service.assist(
          "noodle.",
          "pre",
          7,
          context,
          true,
          AbortSignal.abort(),
        ),
      ).toEqual({ items: [], query: "" })
    } finally {
      release()
      service.dispose()
    }
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
