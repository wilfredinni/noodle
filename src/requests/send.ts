import type { Auth, Environment, Request, Response } from "../schema"
import { substitute } from "./substitute"

export async function send(req: Request, env?: Environment): Promise<Response> {
  const substituted = env !== undefined ? substitute(req, env) : req

  const u = new URL(substituted.url)
  for (const [k, v] of Object.entries(substituted.params)) {
    u.searchParams.append(k, v)
  }
  const finalUrl = u.toString()

  const headers = new Headers(substituted.headers)
  const ah = authHeader(substituted.auth)
  if (ah) {
    headers.set(ah.name, ah.value)
  }

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

function authHeader(
  auth: Auth | undefined,
): { name: string; value: string } | null {
  if (auth === undefined || auth.type === "none") return null
  if (auth.type === "bearer") {
    return { name: "Authorization", value: `Bearer ${auth.token}` }
  }
  const encoded = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64")
  return { name: "Authorization", value: `Basic ${encoded}` }
}
