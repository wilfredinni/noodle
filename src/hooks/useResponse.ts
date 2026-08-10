import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import type {
  Collection,
  Environment,
  NetworkEvent,
  Request,
  Response,
} from "../schema"
import type { ProxyPolicy } from "../proxy"
import type { TlsPolicy } from "../tls"
import { executor } from "../requests"
import {
  startSend,
  finishSend,
  failSend,
  type SendState,
} from "../ui/sendState"

type CachedResult =
  | { status: "done"; response: Response }
  | { status: "error"; request: Request; error: Error }

export type SendCompleteResult =
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
  onComplete?: (req: Request, result: SendCompleteResult) => void,
  collection?: Collection,
  requestPath?: string,
  proxyPolicy?: ProxyPolicy,
  tlsPolicy?: TlsPolicy,
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

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const trySend = useCallback(() => {
    const req = selectedRequest
    if (req === null) return
    setState((prev) => {
      if (prev.status === "sending") return prev
      const controller = new AbortController()
      abortRef.current = controller
      void runSend(
        req,
        env ?? undefined,
        controller.signal,
        setState,
        cacheRef,
        abortRef,
        onCompleteRef,
        collection,
        requestPath,
        proxyPolicy,
        tlsPolicy,
      )
      return startSend(prev, req)
    })
  }, [selectedRequest, env, collection, requestPath, proxyPolicy, tlsPolicy])

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
  cacheRef: React.RefObject<Map<string, CachedResult>>,
  abortRef: React.RefObject<AbortController | null>,
  onCompleteRef: React.RefObject<
    ((req: Request, result: SendCompleteResult) => void) | undefined
  >,
  collection?: Collection,
  requestPath?: string,
  proxyPolicy?: ProxyPolicy,
  tlsPolicy?: TlsPolicy,
): Promise<void> {
  try {
    const res = await executor.send(
      req,
      env,
      signal,
      collection,
      requestPath,
      (network: NetworkEvent[]) => {
        setState((prev) =>
          prev.status === "sending" && prev.request.id === req.id
            ? { ...prev, network }
            : prev,
        )
      },
      proxyPolicy,
      tlsPolicy,
    )
    cacheRef.current.set(req.id, { status: "done", response: res })
    setState((prev) => finishSend(prev, req, res))
    onCompleteRef.current?.(req, { status: "done", response: res })
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      setState({ status: "idle" })
      return
    }
    const err = e instanceof Error ? e : new Error(String(e))
    cacheRef.current.set(req.id, { status: "error", request: req, error: err })
    setState((prev) => failSend(prev, req, err))
    onCompleteRef.current?.(req, { status: "error", request: req, error: err })
  } finally {
    abortRef.current = null
  }
}
