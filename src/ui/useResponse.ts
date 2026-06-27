import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { Environment, Request, Response } from "../schema"
import { executor } from "../requests"
import { startSend, finishSend, failSend, type SendState } from "./sendState"

type CachedResult =
  | { status: "done"; response: Response }
  | { status: "error"; request: Request; error: Error }

export interface UseResponseResult {
  state: SendState
  trySend: () => void
  cancelSend: () => void
}

export function useResponse(
  selectedRequest: Request | null,
  env?: Environment | null,
): UseResponseResult {
  const [state, setState] = useState<SendState>({ status: "idle" })
  const cacheRef = useRef<Map<string, CachedResult>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!selectedRequest) {
      setState({ status: "idle" })
      return
    }
    const cached = cacheRef.current.get(selectedRequest.id)
    if (cached) {
      if (cached.status === "done") {
        setState({ status: "done", response: cached.response })
      } else {
        setState(cached)
      }
    } else {
      setState({ status: "idle" })
    }
  }, [selectedRequest?.id])

  const trySend = useCallback(() => {
    const req = selectedRequest
    if (req === null) return
    setState((prev) => {
      if (prev.status === "sending") return prev
      const controller = new AbortController()
      abortRef.current = controller
      void runSend(req, env ?? undefined, controller.signal, setState, cacheRef, abortRef)
      return startSend(prev, req)
    })
  }, [selectedRequest, env])

  const cancelSend = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { state, trySend, cancelSend }
}

async function runSend(
  req: Request,
  env: Environment | undefined,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<SendState>>,
  cacheRef: React.MutableRefObject<Map<string, CachedResult>>,
  abortRef: React.MutableRefObject<AbortController | null>,
): Promise<void> {
  try {
    const res = await executor.send(req, env, signal)
    cacheRef.current.set(req.id, { status: "done", response: res })
    setState((prev) => finishSend(prev, req, res))
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      setState({ status: "idle" })
      return
    }
    const err = e instanceof Error ? e : new Error(String(e))
    cacheRef.current.set(req.id, { status: "error", request: req, error: err })
    setState((prev) => failSend(prev, req, err))
  } finally {
    abortRef.current = null
  }
}
