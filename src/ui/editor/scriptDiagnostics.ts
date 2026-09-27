import { generateScriptDeclarations } from "../../scriptApiTypes"
import { SCRIPT_LIMITS, type ScriptPhase } from "../../preRequestScript"
import type { ScriptDiagnostics } from "./scriptSemanticChecker"
import type { CodeEdit } from "./codeFormatting"
import type {
  ScriptAssistance,
  ScriptCompletionContext,
  ScriptCompletionDetails,
} from "./scriptCompletion"

type Input = { source: string; phase: ScriptPhase }
type Jobs = {
  format: Input
  check: Input
  assist: Input & {
    cursor: number
    context: ScriptCompletionContext
    explicit: boolean
  }
  details: Input & { cursor: number; key: string }
}
type Results = {
  format: CodeEdit[] | null
  check: ScriptDiagnostics
  assist: ScriptAssistance
  details: ScriptCompletionDetails
}
type Job = { [K in keyof Jobs]: Jobs[K] & { kind: K; id: number } }[keyof Jobs]
export type ScriptDiagnosticsRequest =
  | {
      kind: "init"
      declarations: Record<ScriptPhase, string>
      sourceLimit: number
    }
  | Job
  | { kind: "clear" }

const unavailable = () => new Error("Semantic validation unavailable")
const empty = {
  format: null,
  check: { count: 0 },
  assist: { items: [], query: "" },
  details: {},
}
type Pending = {
  job: Job
  finish: (error?: Error, result?: Results[keyof Results]) => void
}

export function createScriptDiagnostics(
  startWorker = () =>
    new Worker(new URL("./scriptDiagnostics.worker.ts", import.meta.url).href),
  deadlineMs = 5_000,
) {
  let worker: Worker | undefined
  let active: Pending | undefined
  const queued = new Map<keyof Jobs, Pending>()
  const formats: Pending[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let sequence = 0
  let disposed = false
  let sessions = 0
  const clear = () => {
    if (!sessions && !active && !queued.size && !formats.length)
      worker?.postMessage({ kind: "clear" })
  }
  const fail = () => {
    clearTimeout(timer)
    const failed = worker
    worker = undefined
    failed?.terminate()
    active?.finish(unavailable())
    for (const pending of queued.values()) pending.finish(unavailable())
    for (const pending of formats.splice(0)) pending.finish(unavailable())
    active = undefined
    queued.clear()
  }
  const dispatch = () => {
    if (active || disposed) return
    const kind = (["format", "assist", "details", "check"] as const).find(
      (kind) => queued.has(kind),
    )
    if (!kind && !formats.length) {
      clear()
      return
    }
    active = formats.shift() ?? queued.get(kind!)!
    if (active.job.kind !== "format") queued.delete(kind!)
    timer = setTimeout(fail, deadlineMs)
    try {
      if (!worker) {
        const created = startWorker()
        worker = created
        created.onmessage = (
          event: MessageEvent<{
            id: number
            result?: Results[keyof Results]
            error?: boolean
          }>,
        ) => {
          if (worker !== created || event.data.id !== active?.job.id) return
          if (event.data.error) {
            fail()
            return
          }
          clearTimeout(timer)
          active.finish(undefined, event.data.result)
          active = undefined
          dispatch()
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
      worker.postMessage(active.job)
    } catch {
      fail()
    }
  }
  function request<K extends keyof Jobs>(
    kind: K,
    input: Jobs[K],
    signal?: AbortSignal,
  ): Promise<Results[K]> {
    if (disposed) return Promise.reject(unavailable())
    if (Buffer.byteLength(input.source) > SCRIPT_LIMITS.sourceBytes)
      return Promise.reject(new Error("source exceeds 256 KiB"))
    if (signal?.aborted || (kind === "check" && !input.source.trim()))
      return Promise.resolve(empty[kind] as Results[K])
    return new Promise((resolve, reject) => {
      let finished = false
      const pending: Pending = {
        job: { ...input, kind, id: ++sequence } as Job,
        finish(error, result) {
          if (finished) return
          finished = true
          signal?.removeEventListener("abort", abort)
          if (error) reject(error)
          else resolve((result ?? empty[kind]) as Results[K])
        },
      }
      const abort = () => {
        if (queued.get(kind) === pending) queued.delete(kind)
        // Superseded edits discard their replies without throwing away a warm service.
        // The existing hard deadline still recovers a worker that never replies.
        pending.finish()
        dispatch()
      }
      signal?.addEventListener("abort", abort, { once: true })
      if (kind === "format") formats.push(pending)
      else {
        queued.get(kind)?.finish()
        queued.set(kind, pending)
      }
      dispatch()
    })
  }
  return {
    format(source: string, phase: ScriptPhase) {
      return request("format", { source, phase })
    },
    check(source: string, phase: ScriptPhase, signal?: AbortSignal) {
      return request("check", { source, phase }, signal)
    },
    assist(
      source: string,
      phase: ScriptPhase,
      cursor: number,
      context: ScriptCompletionContext,
      explicit = false,
      signal?: AbortSignal,
    ) {
      return request(
        "assist",
        { source, phase, cursor, context, explicit },
        signal,
      )
    },
    details(
      source: string,
      phase: ScriptPhase,
      cursor: number,
      key: string,
      signal?: AbortSignal,
    ) {
      return request("details", { source, phase, cursor, key }, signal)
    },
    retain() {
      sessions++
      let released = false
      return () => {
        if (!released) {
          released = true
          sessions--
          clear()
        }
      }
    },
    dispose() {
      disposed = true
      fail()
    },
  }
}
