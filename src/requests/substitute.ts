import type { Auth, Environment, ParamEntry, Request } from "../schema"

const VAR_RE = /\$(\w+)/g

export type SubstitutedRequest = Omit<Request, "headers" | "params"> & {
  headers: Record<string, string>
  params: ParamEntry[]
}

export function substitute(req: Request, env: Environment): SubstitutedRequest {
  const resolve = (s: string, field: string): string =>
    s.replace(VAR_RE, (_, name) => {
      if (!Object.hasOwn(env.vars, name)) {
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

  const pathParams: ParamEntry[] = (req.pathParams ?? []).map((entry, i) => {
    return {
      name: resolve(entry.name, `pathParams[${i}].name`),
      value: resolve(entry.value, `pathParams[${i}].value`),
      enabled: true,
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
    pathParams,
    body: req.body !== undefined ? resolve(req.body, "body") : undefined,
    bodyType: req.bodyType,
    formData,
    filePath,
    auth,
    tls: req.tls,
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
  if (auth.type === "aws_sigv4") {
    return {
      type: "aws_sigv4",
      access_key: resolve(auth.access_key, "auth.access_key"),
      secret_key: resolve(auth.secret_key, "auth.secret_key"),
      region: resolve(auth.region, "auth.region"),
      service: resolve(auth.service, "auth.service"),
      ...(auth.session_token
        ? { session_token: resolve(auth.session_token, "auth.session_token") }
        : {}),
    }
  }
  return {
    type: "basic",
    user: resolve(auth.user, "auth.user"),
    pass: resolve(auth.pass, "auth.pass"),
  }
}
