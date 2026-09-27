import { generateScriptDeclarations } from "../../scriptApiTypes"
import { SCRIPT_LIMITS, type ScriptPhase } from "../../preRequestScript"
import type { ScriptDiagnostics } from "./scriptSemanticChecker"

export type ScriptDiagnosticsRequest =
  | {
      kind: "init"
      declarations: Record<ScriptPhase, string>
      sourceLimit: number
    }
  | { kind: "check"; id: number; source: string; phase: ScriptPhase }
  | { kind: "clear" }

const unavailable = () => new Error("Semantic validation unavailable")
type Pending = {
  id: number
  source: string
  phase: ScriptPhase
  resolve: (result: ScriptDiagnostics) => void
  reject: (error: Error) => void
  cleanup: () => void
}

export function createScriptDiagnostics(
  startWorker = () =>
    new Worker(new URL("./scriptDiagnostics.worker.ts", import.meta.url).href),
  deadlineMs = 5_000,
) {
  let worker: Worker | undefined
  let active: Pending | undefined
  let queued: Pending | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let sequence = 0
  let disposed = false
  const finish = (
    pending: Pending | undefined,
    error?: Error,
    result?: ScriptDiagnostics,
  ) => {
    if (!pending) return
    pending.cleanup()
    if (error) pending.reject(error)
    else pending.resolve(result ?? { count: 0 })
  }
  const fail = () => {
    clearTimeout(timer)
    const failed = worker
    worker = undefined
    failed?.terminate()
    finish(active, unavailable())
    finish(queued, unavailable())
    active = queued = undefined
  }
  const dispatch = () => {
    if (active || !queued || disposed) return
    active = queued
    queued = undefined
    timer = setTimeout(fail, deadlineMs)
    try {
      if (!worker) {
        const created = startWorker()
        worker = created
        created.onmessage = (
          event: MessageEvent<{
            id: number
            result?: ScriptDiagnostics
            error?: boolean
          }>,
        ) => {
          if (worker !== created || event.data.id !== active?.id) return
          if (event.data.error) {
            fail()
            return
          }
          clearTimeout(timer)
          finish(active, undefined, event.data.result)
          active = undefined
          if (queued) dispatch()
          else
            created.postMessage({
              kind: "clear",
            } satisfies ScriptDiagnosticsRequest)
        }
        created.onerror = (event) => {
          event.preventDefault()
          if (worker === created) fail()
        }
        created.addEventListener("close", () => {
          if (worker === created) fail()
        })
        created.postMessage({
          kind: "init",
          sourceLimit: SCRIPT_LIMITS.sourceBytes,
          declarations: {
            pre: generateScriptDeclarations("pre"),
            post: generateScriptDeclarations("post"),
            tests: generateScriptDeclarations("tests"),
          },
        } satisfies ScriptDiagnosticsRequest)
      }
      worker.postMessage({
        kind: "check",
        id: active.id,
        source: active.source,
        phase: active.phase,
      } satisfies ScriptDiagnosticsRequest)
    } catch {
      fail()
    }
  }
  return {
    check(
      source: string,
      phase: ScriptPhase,
      signal?: AbortSignal,
    ): Promise<ScriptDiagnostics> {
      if (disposed) return Promise.reject(unavailable())
      if (Buffer.byteLength(source) > SCRIPT_LIMITS.sourceBytes)
        return Promise.reject(new Error("source exceeds 256 KiB"))
      if (signal?.aborted || !source.trim())
        return Promise.resolve({ count: 0 })
      return new Promise((resolve, reject) => {
        const pending: Pending = {
          id: ++sequence,
          source,
          phase,
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener("abort", abort),
        }
        const abort = () => {
          if (queued === pending) queued = undefined
          if (active === pending) {
            clearTimeout(timer)
            const obsolete = worker
            worker = undefined
            active = undefined
            obsolete?.terminate()
          }
          finish(pending)
          dispatch()
        }
        signal?.addEventListener("abort", abort, { once: true })
        finish(queued)
        queued = pending
        dispatch()
      })
    },
    dispose() {
      disposed = true
      fail()
    },
  }
}
