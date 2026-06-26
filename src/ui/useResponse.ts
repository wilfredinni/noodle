import { useCallback, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { Environment, Request } from "../schema"
import { executor } from "../requests"
import { startSend, finishSend, failSend, type SendState } from "./sendState"

export interface UseResponseResult {
  state: SendState
  trySend: () => void
}

export function useResponse(
  selectedRequest: Request | null,
  env?: Environment | null,
): UseResponseResult {
  const [state, setState] = useState<SendState>({ status: "idle" })

  const trySend = useCallback(() => {
    const req = selectedRequest
    if (req === null) return
    setState((prev) => {
      if (prev.status === "sending") return prev
      void runSend(req, env ?? undefined, setState)
      return startSend(prev, req)
    })
  }, [selectedRequest, env])

  return { state, trySend }
}

async function runSend(
  req: Request,
  env: Environment | undefined,
  setState: Dispatch<SetStateAction<SendState>>,
): Promise<void> {
  try {
    const res = await executor.send(req, env)
    setState((prev) => finishSend(prev, req, res))
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    setState((prev) => failSend(prev, req, err))
  }
}
