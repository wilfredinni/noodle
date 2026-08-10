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
import type { TlsPolicy } from "../tls"

export interface RequestExecutor {
  send(
    req: Request,
    env?: Environment,
    signal?: AbortSignal,
    collection?: Collection,
    requestPath?: string,
    onNetworkEvent?: (network: NetworkEvent[]) => void,
    proxyPolicy?: ProxyPolicy,
    tlsPolicy?: TlsPolicy,
  ): Promise<Response>
}

export const executor: RequestExecutor = {
  send,
}

export { substitute, send }
