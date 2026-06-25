import type { Auth, Environment, Request, Response } from "../schema"
import { substitute } from "./substitute"

export async function send(req: Request, env?: Environment): Promise<Response> {
  const substituted = env !== undefined ? substitute(req, env) : req

  let finalUrl: string
  try {
    const u = new URL(substituted.url)
    for (const [k, v] of Object.entries(substituted.params)) {
      u.searchParams.append(k, v)
    }
    finalUrl = u.toString()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`requests.send: invalid url "${substituted.url}": ${msg}`, {
      cause: e,
    })
  }

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
  let res: globalThis.Response
  try {
    res = await fetch(finalUrl, init)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`requests.send: fetch failed: ${msg}`, { cause: e })
  }

  let body: string
  try {
    body = await res.text()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`requests.send: failed to read response body: ${msg}`, {
      cause: e,
    })
  }

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
