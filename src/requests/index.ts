import type { Response } from "../schema"
import { send, sendPrepared } from "./send"
import type { TransportExecutionOptions, TransportRequest } from "./send"
import { substitute } from "./substitute"

export interface RequestExecutor {
  send(
    req: TransportRequest,
    options?: TransportExecutionOptions,
  ): Promise<Response>
}

export const executor: RequestExecutor = {
  send: sendPrepared,
}

export { substitute, send }
export type {
  RequestExecutionOptions,
  TransportExecutionOptions,
  TransportRequest,
} from "./send"
