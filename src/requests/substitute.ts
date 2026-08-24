import type {
  AssertionValue,
  Auth,
  Environment,
  ParamEntry,
  Request,
  ResponseAssertion,
} from "../schema"

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

  const assertions = req.assertions?.map((assertion, index) => {
    if (assertion.value === undefined) return assertion
    return {
      ...assertion,
      value: substituteAssertionValue(
        assertion.value,
        resolve,
        `assertions[${index}].value`,
      ),
    } as ResponseAssertion
  })

  return {
    id: req.id,
    name: req.name,
    method: req.method,
    url: resolve(req.url, "url"),
    timeout: req.timeout,
    followRedirects: req.followRedirects,
    maxRedirects: req.maxRedirects,
    sendCookies: req.sendCookies,
    headers,
    params,
    pathParams,
    body: req.body !== undefined ? resolve(req.body, "body") : undefined,
    bodyType: req.bodyType,
    formData,
    filePath,
    auth,
    tls: req.tls,
    assertions,
  }
}

function substituteAssertionValue(
  value: AssertionValue,
  resolve: (value: string, field: string) => string,
  field: string,
): AssertionValue {
  if (typeof value === "string") return resolve(value, field)
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      substituteAssertionValue(item, resolve, `${field}[${index}]`),
    )
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        substituteAssertionValue(item, resolve, `${field}.${key}`),
      ]),
    )
  }
  return value
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
  if (auth.type === "ntlm") {
    return {
      type: "ntlm",
      username: resolve(auth.username, "auth.username"),
      password: resolve(auth.password, "auth.password"),
      domain: resolve(auth.domain, "auth.domain"),
      workstation: resolve(auth.workstation, "auth.workstation"),
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
  if (auth.type === "oauth1") {
    return {
      ...auth,
      consumer_key: resolve(auth.consumer_key, "auth.consumer_key"),
      consumer_secret: resolve(auth.consumer_secret, "auth.consumer_secret"),
      access_token: resolve(auth.access_token, "auth.access_token"),
      access_token_secret: resolve(
        auth.access_token_secret,
        "auth.access_token_secret",
      ),
      private_key: resolve(auth.private_key, "auth.private_key"),
      callback_url: resolve(auth.callback_url, "auth.callback_url"),
      verifier: resolve(auth.verifier, "auth.verifier"),
      timestamp: resolve(auth.timestamp, "auth.timestamp"),
      nonce: resolve(auth.nonce, "auth.nonce"),
      version: resolve(auth.version, "auth.version"),
      realm: resolve(auth.realm, "auth.realm"),
    }
  }
  if (auth.type === "oauth2") {
    const resolveParam = (
      parameter: (typeof auth.additional_parameters.token)[number],
      phase: "authorization" | "token" | "refresh",
      index: number,
    ) =>
      parameter.enabled
        ? {
            ...parameter,
            name: resolve(
              parameter.name,
              `auth.additional_parameters.${phase}[${index}].name`,
            ),
            value: resolve(
              parameter.value,
              `auth.additional_parameters.${phase}[${index}].value`,
            ),
          }
        : { ...parameter }
    return {
      ...auth,
      authorization_url: resolve(
        auth.authorization_url,
        "auth.authorization_url",
      ),
      access_token_url: resolve(auth.access_token_url, "auth.access_token_url"),
      refresh_token_url: resolve(
        auth.refresh_token_url,
        "auth.refresh_token_url",
      ),
      client_id: resolve(auth.client_id, "auth.client_id"),
      client_secret: resolve(auth.client_secret, "auth.client_secret"),
      username: resolve(auth.username, "auth.username"),
      password: resolve(auth.password, "auth.password"),
      scope: resolve(auth.scope, "auth.scope"),
      audience: resolve(auth.audience, "auth.audience"),
      redirect_uri: resolve(auth.redirect_uri, "auth.redirect_uri"),
      credentials_id: resolve(auth.credentials_id, "auth.credentials_id"),
      client_assertion_key: resolve(
        auth.client_assertion_key,
        "auth.client_assertion_key",
      ),
      client_assertion_issuer: resolve(
        auth.client_assertion_issuer,
        "auth.client_assertion_issuer",
      ),
      client_assertion_subject: resolve(
        auth.client_assertion_subject,
        "auth.client_assertion_subject",
      ),
      client_assertion_audience: resolve(
        auth.client_assertion_audience,
        "auth.client_assertion_audience",
      ),
      token_header: resolve(auth.token_header, "auth.token_header"),
      token_prefix: resolve(auth.token_prefix, "auth.token_prefix"),
      token_query_key: resolve(auth.token_query_key, "auth.token_query_key"),
      additional_parameters: {
        authorization: auth.additional_parameters.authorization.map((p, i) =>
          resolveParam(p, "authorization", i),
        ),
        token: auth.additional_parameters.token.map((p, i) =>
          resolveParam(p, "token", i),
        ),
        refresh: auth.additional_parameters.refresh.map((p, i) =>
          resolveParam(p, "refresh", i),
        ),
      },
    }
  }
  return {
    type: "basic",
    user: resolve(auth.user, "auth.user"),
    pass: resolve(auth.pass, "auth.pass"),
  }
}
