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
import type { CollectionCookieJar } from "../cookies"
import { executor } from "../requests"
import {
  startSend,
  finishSend,
  failSend,
  type SendState,
} from "../ui/sendState"
import type { ResponseExecutionResults } from "../executionResults"
import {
  evaluateResponseExecution,
  executionSecretValues,
  unevaluatedExecutionResults,
} from "../executionResults"
import { RunScope } from "../runScope"
import { substitute } from "../requests/substitute"
import { persistResponseCaptures } from "../app/services"
import type { CaptureResult } from "../runScope"

type CachedResult =
  | {
      status: "done"
      requestId: string
      response: Response
      execution?: ResponseExecutionResults
    }
  | {
      status: "error"
      request: Request
      error: Error
      execution?: ResponseExecutionResults
    }

export type SendCompleteResult =
  | {
      status: "done"
      response: Response
      execution?: ResponseExecutionResults
    }
  | {
      status: "error"
      request: Request
      error: Error
      execution?: ResponseExecutionResults
    }

export interface UseResponseResult {
  state: SendState
  trySend: () => void
  cancelSend: () => void
}

export function useResponse(
  selectedRequest: Request | null,
  env?: Environment | null,
  onComplete?: (
    req: Request,
    result: SendCompleteResult,
    dispatchEnvironment?: Environment,
  ) => void,
  collection?: Collection,
  requestPath?: string,
  proxyPolicy?: ProxyPolicy,
  tlsPolicy?: TlsPolicy,
  cookies?: CollectionCookieJar | null,
  collectionDir?: string,
  onEnvironmentPersisted?: () => Promise<void>,
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
        setState(cached)
      } else {
        setState(cached)
      }
    } else {
      setState({ status: "idle" })
    }
  }, [selectedRequest?.id])

  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

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
        cookies,
        collectionDir,
        onEnvironmentPersisted,
      )
      return startSend(prev, req)
    })
  }, [
    selectedRequest,
    env,
    collection,
    requestPath,
    proxyPolicy,
    tlsPolicy,
    cookies,
    collectionDir,
    onEnvironmentPersisted,
  ])

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
    | ((
        req: Request,
        result: SendCompleteResult,
        dispatchEnvironment?: Environment,
      ) => void)
    | undefined
  >,
  collection?: Collection,
  requestPath?: string,
  proxyPolicy?: ProxyPolicy,
  tlsPolicy?: TlsPolicy,
  cookies?: CollectionCookieJar | null,
  collectionDir?: string,
  onEnvironmentPersisted?: () => Promise<void>,
): Promise<void> {
  const runScope = new RunScope()
  try {
    const res = await executor.send(req, {
      environment: env,
      signal,
      collection,
      requestPath,
      onNetworkEvent: (network: NetworkEvent[]) => {
        setState((prev) =>
          prev.status === "sending" && prev.request.id === req.id
            ? { ...prev, network }
            : prev,
        )
      },
      proxyPolicy,
      tlsPolicy,
      collectionDir,
      oauthMode: "interactive",
      ...(cookies ? { cookies } : {}),
    })
    const runEnvironment = runScope.environment(env)
    const effectiveRequest = substitute(req, runEnvironment)
    let rawCaptureResults: CaptureResult[] = []
    let execution = evaluateResponseExecution(
      effectiveRequest,
      res,
      runScope,
      executionSecretValues([env, runEnvironment], proxyPolicy, tlsPolicy),
      (results) => {
        rawCaptureResults = results
      },
    )
    execution = await persistResponseCaptures(
      effectiveRequest,
      rawCaptureResults,
      execution,
      env?.name,
      collectionDir,
    )
    if (
      execution.captures?.results.some(
        (capture) => capture.success && capture.persisted,
      )
    ) {
      await onEnvironmentPersisted?.().catch(() => {})
    }
    const result = { status: "done" as const, response: res, execution }
    cacheRef.current.set(req.id, { ...result, requestId: req.id })
    setState((prev) => finishSend(prev, req, res, execution))
    onCompleteRef.current?.(req, result, env)
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      setState({ status: "idle" })
      return
    }
    const err = e instanceof Error ? e : new Error(String(e))
    const execution = unevaluatedExecutionResults(req)
    const result = {
      status: "error" as const,
      request: req,
      error: err,
      execution,
    }
    cacheRef.current.set(req.id, result)
    setState((prev) => failSend(prev, req, err, execution))
    onCompleteRef.current?.(req, result, env)
  } finally {
    abortRef.current = null
  }
}
