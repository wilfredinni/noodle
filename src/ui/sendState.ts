import type { Request, Response } from "../schema"

export type SendState =
  | { status: "idle" }
  | { status: "sending"; request: Request }
  | { status: "done"; response: Response }
  | { status: "error"; request: Request; error: Error }

export function startSend(state: SendState, req: Request): SendState {
  if (state.status === "sending") return state
  return { status: "sending", request: req }
}

export function finishSend(
  _state: SendState,
  _req: Request,
  res: Response,
): SendState {
  return { status: "done", response: res }
}

export function failSend(
  _state: SendState,
  req: Request,
  error: Error,
): SendState {
  return { status: "error", request: req, error }
}
