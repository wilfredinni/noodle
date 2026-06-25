import type { Environment, Request, Response } from "../schema"
import { substitute } from "./substitute"

export async function send(req: Request, env?: Environment): Promise<Response> {
  const substituted = env !== undefined ? substitute(req, env) : req

  const u = new URL(substituted.url)
  for (const [k, v] of Object.entries(substituted.params)) {
    u.searchParams.append(k, v)
  }
  const finalUrl = u.toString()

  const headers = new Headers(substituted.headers)

  const init: RequestInit = {
    method: substituted.method,
    headers,
    body: substituted.body,
  }

  const start = performance.now()
  const res = await fetch(finalUrl, init)
  const body = await res.text()

  return {
    status: res.status,
    statusText: res.statusText,
    headers: headersToObject(res.headers),
    body,
    timeMs: performance.now() - start,
  }
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((v, k) => {
    out[k] = v
  })
  return out
}
