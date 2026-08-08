import type {
  Collection,
  Environment,
  NetworkEvent,
  Request,
  Response,
} from "../schema"
import { send } from "./send"
import { substitute } from "./substitute"
import type { ProxyPolicy } from "../proxy"

export interface RequestExecutor {
  send(
    req: Request,
    env?: Environment,
    signal?: AbortSignal,
    collection?: Collection,
    requestPath?: string,
    onNetworkEvent?: (network: NetworkEvent[]) => void,
    proxyPolicy?: ProxyPolicy,
  ): Promise<Response>
}

export const executor: RequestExecutor = {
  send,
}

export { substitute, send }
