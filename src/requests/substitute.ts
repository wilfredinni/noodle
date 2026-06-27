import type { Auth, Environment, Request } from "../schema"

const VAR_RE = /\{\{(\w+)\}\}/g

export function substitute(req: Request, env: Environment): Request {
  const resolve = (s: string, field: string): string =>
    s.replace(VAR_RE, (_, name) => {
      if (!(name in env.vars)) {
        throw new Error(
          `requests.substitute: unresolved variable "${name}" in ${field}`,
        )
      }
      return env.vars[name]
    })

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v.enabled) continue
    headers[k] = resolve(v.value, `headers.${k}`)
  }

  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.params)) {
    if (!v.enabled) continue
    params[k] = resolve(v.value, `params.${k}`)
  }

  const auth =
    req.auth === undefined ? undefined : substituteAuth(req.auth, resolve)

  return {
    id: req.id,
    name: req.name,
    method: req.method,
    url: resolve(req.url, "url"),
    headers,
    params,
    body: req.body !== undefined ? resolve(req.body, "body") : undefined,
    auth,
  }
}

function substituteAuth(
  auth: Auth,
  resolve: (s: string, field: string) => string,
): Auth {
  if (auth.type === "none") return { type: "none" }
  if (auth.type === "bearer") {
    return { type: "bearer", token: resolve(auth.token, "auth.token") }
  }
  return {
    type: "basic",
    user: resolve(auth.user, "auth.user"),
    pass: resolve(auth.pass, "auth.pass"),
  }
}
