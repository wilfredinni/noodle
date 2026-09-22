import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core"
import type { ScriptExecutionError } from "./preRequestScript"

export const SCRIPT_WRAPPER_PREFIX = "(async()=>{"

export class ScriptEvaluationError extends Error {
  constructor(readonly diagnostic: ScriptExecutionError) {
    super(diagnostic.message)
    this.name = diagnostic.name
  }
}

/** Runs VM jobs in bounded slices, charging CPU only while the VM is running. */
export class ScriptScheduler {
  readonly signal: AbortSignal
  readonly deadline: number
  pending?: Promise<void>
  hostFailure?: ScriptExecutionError
  active = true
  private readonly controller = new AbortController()
  private readonly timer: ReturnType<typeof setTimeout>
  private readonly interrupted: Promise<void>
  private readonly onAbort: () => void
  private readonly checkRejections: QuickJSHandle
  private cpuUsed = 0
  private sliceStarted = 0

  constructor(
    private readonly context: QuickJSContext,
    private readonly cpuLimit: number,
    wallLimit: number,
    private readonly normalize: (error: QuickJSHandle) => ScriptExecutionError,
    parentSignal?: AbortSignal,
    parentDeadline = Infinity,
  ) {
    this.checkRejections = context.getProp(
      context.global,
      "__quickjsCheckUnhandledRejections",
    )
    context
      .evalCode("delete globalThis.__quickjsCheckUnhandledRejections")
      .unwrap()
      .dispose()
    this.deadline = Math.min(Date.now() + wallLimit, parentDeadline)
    this.signal = parentSignal
      ? AbortSignal.any([parentSignal, this.controller.signal])
      : this.controller.signal
    let interrupt!: () => void
    this.interrupted = new Promise((resolve) => {
      interrupt = resolve
    })
    this.onAbort = interrupt
    this.signal.addEventListener("abort", this.onAbort, { once: true })
    this.timer = setTimeout(
      () => this.controller.abort(),
      Math.max(0, this.deadline - Date.now()),
    )
    context.runtime.setInterruptHandler(
      () =>
        this.signal.aborted ||
        Date.now() >= this.deadline ||
        this.cpuUsed + performance.now() - this.sliceStarted >= cpuLimit,
    )
  }

  run<T>(operation: () => T): T {
    this.sliceStarted = performance.now()
    try {
      return operation()
    } finally {
      this.cpuUsed += performance.now() - this.sliceStarted
    }
  }

  check(): void {
    if (this.hostFailure) throw new ScriptEvaluationError(this.hostFailure)
    if (Date.now() >= this.deadline)
      throw new ScriptEvaluationError({
        name: "ScriptWallTimeoutError",
        message: "Script exceeded its network/wall-time deadline",
      })
    if (this.signal.aborted)
      throw new DOMException("Script cancelled", "AbortError")
    if (this.cpuUsed >= this.cpuLimit)
      throw new ScriptEvaluationError({
        name: "ScriptTimeoutError",
        message: `Script exceeded the ${this.cpuLimit} ms execution budget`,
      })
  }

  private guestError(handle: QuickJSHandle): ScriptEvaluationError {
    try {
      return new ScriptEvaluationError(this.run(() => this.normalize(handle)))
    } finally {
      handle.dispose()
    }
  }

  async evaluate(
    source: string,
    filename: string,
    finishTests?: QuickJSHandle,
  ): Promise<void> {
    this.check()
    const evaluated = this.run(() =>
      this.context.evalCode(
        `${SCRIPT_WRAPPER_PREFIX}${source}\n})()`,
        filename,
        { type: "global" },
      ),
    )
    if (evaluated.error) throw this.guestError(evaluated.error)
    let completion = evaluated.value!
    let testsStarted = !finishTests
    let scriptError: ScriptEvaluationError | undefined
    let jobs = 0
    try {
      for (;;) {
        this.check()
        const state = this.context.getPromiseState(completion)
        if (state.type === "rejected") {
          const error = this.guestError(state.error)
          if (testsStarted) throw error
          scriptError ??= error
        }
        const done = state.type !== "pending"
        if (state.type === "fulfilled") state.value.dispose()
        if (this.context.runtime.hasPendingJob()) {
          const job = this.run(() => this.context.runtime.executePendingJobs(1))
          if (job.error) throw this.guestError(job.error)
          if (++jobs % 32 === 0)
            await new Promise<void>((resolve) => setImmediate(resolve))
          continue
        }
        if (done && this.pending)
          throw new ScriptEvaluationError({
            name: "ScriptPendingOperationError",
            message: "Await every request call before the script completes",
          })
        if (done && !testsStarted) {
          testsStarted = true
          const finished = this.run(() =>
            this.context.callFunction(finishTests!, this.context.undefined),
          )
          if (finished.error) throw this.guestError(finished.error)
          completion.dispose()
          completion = finished.value!
          continue
        }
        if (done) {
          if (scriptError) throw scriptError
          const checked = this.run(() =>
            this.context.callFunction(
              this.checkRejections,
              this.context.undefined,
            ),
          )
          if (checked.error) throw this.guestError(checked.error)
          checked.value.dispose()
          return
        }
        if (!this.pending)
          throw new ScriptEvaluationError({
            name: "ScriptPendingPromiseError",
            message: "Script Promise cannot settle without pending work",
          })
        await Promise.race([this.pending, this.interrupted])
      }
    } finally {
      completion.dispose()
    }
  }

  dispose(): void {
    this.active = false
    this.controller.abort()
    clearTimeout(this.timer)
    this.signal.removeEventListener("abort", this.onAbort)
    this.checkRejections.dispose()
  }
}
