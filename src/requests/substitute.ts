import type { Auth, Environment, ParamEntry, Request } from "../schema"

const VAR_RE = /\$(\w+)/g

export type SubstitutedRequest = Omit<Request, "headers" | "params"> & {
  headers: Record<string, string>
  params: ParamEntry[]
}

export function substitute(req: Request, env: Environment): SubstitutedRequest {
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

  const params: ParamEntry[] = req.params.map((entry, i) => {
    if (!entry.enabled) return { ...entry }
    return {
      name: resolve(entry.name, `params[${i}].name`),
      value: resolve(entry.value, `params[${i}].value`),
      enabled: entry.enabled,
    }
  })

  const auth =
    req.auth === undefined ? undefined : substituteAuth(req.auth, resolve)

  const formData =
    req.formData !== undefined
      ? req.formData.map((entry, i) => {
          if (!entry.enabled) return { ...entry }
          return {
            name: resolve(entry.name, `formData[${i}].name`),
            value: resolve(entry.value, `formData[${i}].value`),
            enabled: entry.enabled,
            type: entry.type,
          }
        })
      : req.formData

  const filePath =
    req.filePath !== undefined
      ? resolve(req.filePath, "filePath")
      : req.filePath

  return {
    id: req.id,
    name: req.name,
    method: req.method,
    url: resolve(req.url, "url"),
    timeout: req.timeout,
    followRedirects: req.followRedirects,
    maxRedirects: req.maxRedirects,
    headers,
    params,
    body: req.body !== undefined ? resolve(req.body, "body") : undefined,
    bodyType: req.bodyType,
    formData,
    filePath,
    auth,
  }
}

function substituteAuth(
  auth: Auth,
  resolve: (s: string, field: string) => string,
): Auth {
  if (auth.type === "none") return { type: "none" }
  if (auth.type === "inherit") return { type: "inherit" }
  if (auth.type === "bearer") {
    return { type: "bearer", token: resolve(auth.token, "auth.token") }
  }
  if (auth.type === "api_key") {
    return {
      type: "api_key",
      key: resolve(auth.key, "auth.key"),
      value: resolve(auth.value, "auth.value"),
      placement: auth.placement,
    }
  }
  return {
    type: "basic",
    user: resolve(auth.user, "auth.user"),
    pass: resolve(auth.pass, "auth.pass"),
  }
}
