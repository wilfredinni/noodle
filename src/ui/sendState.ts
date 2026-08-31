import type { NetworkEvent, Request, Response } from "../schema"
import type { ResponseExecutionResults } from "../executionResults"

export type SendState =
  | { status: "idle" }
  | { status: "sending"; request: Request; network: NetworkEvent[] }
  | {
      status: "done"
      requestId?: string
      response: Response
      execution?: ResponseExecutionResults
    }
  | {
      status: "error"
      request: Request
      error: Error
      execution?: ResponseExecutionResults
    }

export function startSend(state: SendState, req: Request): SendState {
  if (state.status === "sending") return state
  return { status: "sending", request: req, network: [] }
}

export function finishSend(
  _state: SendState,
  req: Request,
  res: Response,
  execution?: ResponseExecutionResults,
): SendState {
  return { status: "done", requestId: req.id, response: res, execution }
}

export function failSend(
  _state: SendState,
  req: Request,
  error: Error,
  execution?: ResponseExecutionResults,
): SendState {
  return { status: "error", request: req, error, execution }
}
