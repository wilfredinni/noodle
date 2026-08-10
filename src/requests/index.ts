import type { Request, Response } from "../schema"
import { send } from "./send"
import type { RequestExecutionOptions } from "./send"
import { substitute } from "./substitute"

export interface RequestExecutor {
  send(req: Request, options?: RequestExecutionOptions): Promise<Response>
}

export const executor: RequestExecutor = {
  send,
}

export { substitute, send }
export type { RequestExecutionOptions }
