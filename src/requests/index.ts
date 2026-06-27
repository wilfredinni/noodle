import type { Environment, Request, Response } from "../schema"
import { send } from "./send"
import { substitute } from "./substitute"

export interface RequestExecutor {
  send(req: Request, env?: Environment, signal?: AbortSignal): Promise<Response>
}

export const executor: RequestExecutor = {
  send,
}

export { substitute, send }
