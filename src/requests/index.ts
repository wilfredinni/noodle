import type { Environment, Request, Response } from "../schema"
import { substitute } from "./substitute"

export interface RequestExecutor {
  send(req: Request, env?: Environment): Promise<Response>
}

export const executor: RequestExecutor = {
  async send() {
    throw new Error("requests.send: not implemented")
  },
}

export { substitute }
