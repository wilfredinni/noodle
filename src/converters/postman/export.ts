import type {
  Auth,
  Collection,
  CollectionItem,
  Environment,
  FormEntry,
  Request,
} from "../../schema"
import { Url as PmUrl } from "postman-collection"
import { mergeFolderOverrides } from "../../requests/mergeFolderOverrides"
import { expandUserPath } from "../../userPath"
import { replaceVariableReferences } from "../../variableReference"

type PostmanObject = Record<string, unknown>

export interface PostmanExportResult {
  document: PostmanObject
  operationCount: number
}

const POSTMAN_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"

export function toPostmanTpl(value: string): string {
  return replaceVariableReferences(value, (variable) => `{{${variable}}}`)
}

function postmanAuth(auth: Auth | undefined): PostmanObject | undefined {
  if (!auth || auth.type === "inherit") return undefined
  if (auth.type === "none") return { type: "noauth" }
  if (auth.type === "bearer") {
    return {
      type: "bearer",
      bearer: [
        { key: "token", value: toPostmanTpl(auth.token), type: "string" },
      ],
    }
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: toPostmanTpl(auth.user), type: "string" },
        { key: "password", value: toPostmanTpl(auth.pass), type: "string" },
      ],
    }
  }
  if (auth.type === "ntlm") {
    const ntlm = [
      {
        key: "username",
        value: toPostmanTpl(auth.username),
        type: "string",
      },
      {
        key: "password",
        value: toPostmanTpl(auth.password),
        type: "string",
      },
    ]
    if (auth.domain) {
      ntlm.push({
        key: "domain",
        value: toPostmanTpl(auth.domain),
        type: "string",
      })
    }
    if (auth.workstation) {
      ntlm.push({
        key: "workstation",
        value: toPostmanTpl(auth.workstation),
        type: "string",
      })
    }
    return { type: "ntlm", ntlm }
  }
  if (auth.type === "aws_sigv4") {
    const awsv4 = [
      {
        key: "accessKey",
        value: toPostmanTpl(auth.access_key),
        type: "string",
      },
      {
        key: "secretKey",
        value: toPostmanTpl(auth.secret_key),
        type: "string",
      },
      { key: "region", value: toPostmanTpl(auth.region), type: "string" },
      { key: "service", value: toPostmanTpl(auth.service), type: "string" },
      { key: "addAuthDataToQuery", value: false, type: "boolean" },
    ]
    if (auth.session_token) {
      awsv4.push({
        key: "sessionToken",
        value: toPostmanTpl(auth.session_token),
        type: "string",
      })
    }
    return { type: "awsv4", awsv4 }
  }
  if (auth.type === "oauth1") {
    return {
      type: "oauth1",
      oauth1: [
        {
          key: "consumerKey",
          value: toPostmanTpl(auth.consumer_key),
          type: "string",
        },
        {
          key: "consumerSecret",
          value: toPostmanTpl(auth.consumer_secret),
          type: "string",
        },
        {
          key: "token",
          value: toPostmanTpl(auth.access_token),
          type: "string",
        },
        {
          key: "tokenSecret",
          value: toPostmanTpl(auth.access_token_secret),
          type: "string",
        },
        {
          key: "signatureMethod",
          value: auth.signature_method,
          type: "string",
        },
        {
          key: "privateKey",
          value: toPostmanTpl(auth.private_key),
          type: "string",
        },
        { key: "privateKeyType", value: auth.private_key_type, type: "string" },
        {
          key: "callbackUrl",
          value: toPostmanTpl(auth.callback_url),
          type: "string",
        },
        { key: "verifier", value: toPostmanTpl(auth.verifier), type: "string" },
        {
          key: "timestamp",
          value: toPostmanTpl(auth.timestamp),
          type: "string",
        },
        { key: "nonce", value: toPostmanTpl(auth.nonce), type: "string" },
        { key: "version", value: auth.version, type: "string" },
        { key: "realm", value: toPostmanTpl(auth.realm), type: "string" },
        { key: "placement", value: auth.placement, type: "string" },
        {
          key: "includeBodyHash",
          value: auth.include_body_hash,
          type: "boolean",
        },
      ],
    }
  }
  if (auth.type === "oauth2") {
    return {
      type: "oauth2",
      oauth2: [
        { key: "grant_type", value: auth.grant_type, type: "string" },
        {
          key: "authUrl",
          value: toPostmanTpl(auth.authorization_url),
          type: "string",
        },
        {
          key: "accessTokenUrl",
          value: toPostmanTpl(auth.access_token_url),
          type: "string",
        },
        {
          key: "refreshTokenUrl",
          value: toPostmanTpl(auth.refresh_token_url),
          type: "string",
        },
        {
          key: "clientId",
          value: toPostmanTpl(auth.client_id),
          type: "string",
        },
        {
          key: "clientSecret",
          value: toPostmanTpl(auth.client_secret),
          type: "string",
        },
        { key: "username", value: toPostmanTpl(auth.username), type: "string" },
        { key: "password", value: toPostmanTpl(auth.password), type: "string" },
        { key: "scope", value: toPostmanTpl(auth.scope), type: "string" },
        { key: "audience", value: toPostmanTpl(auth.audience), type: "string" },
        {
          key: "redirect_uri",
          value: toPostmanTpl(auth.redirect_uri),
          type: "string",
        },
        {
          key: "client_authentication",
          value: auth.credentials_placement === "basic" ? "header" : "body",
          type: "string",
        },
        {
          key: "code_challenge_method",
          value: auth.pkce ? auth.pkce_method : "",
          type: "string",
        },
        {
          key: "addTokenTo",
          value: auth.token_placement === "query" ? "queryParams" : "header",
          type: "string",
        },
        { key: "headerPrefix", value: auth.token_prefix, type: "string" },
      ],
    }
  }
  return {
    type: "apikey",
    apikey: [
      { key: "key", value: toPostmanTpl(auth.key), type: "string" },
      { key: "value", value: toPostmanTpl(auth.value), type: "string" },
      { key: "in", value: auth.placement, type: "string" },
    ],
  }
}

function folderAuth(auth: Auth | undefined): PostmanObject | undefined {
  return postmanAuth(auth)
}

function decodedQueryKey(value: string): string {
  return [...new URLSearchParams(`${value}=`).keys()][0] ?? value
}

function postmanUrl(request: Request): PostmanObject {
  const original = new PmUrl(request.url)
  const converted = new PmUrl(toPostmanTpl(request.url))
  const originalParams = original.query.all()
  const enabledNames = new Set(
    request.params.filter((param) => param.enabled).map((param) => param.name),
  )
  const query = [
    ...converted.query
      .all()
      .filter(
        (_, index) =>
          !enabledNames.has(decodedQueryKey(originalParams[index]?.key ?? "")),
      )
      .map((param) => ({
        key: param.key,
        value: param.value,
        disabled: false,
      })),
    ...request.params.map((param) => ({
      key: toPostmanTpl(param.name),
      value: toPostmanTpl(param.value),
      disabled: !param.enabled,
    })),
  ]
  const variable = request.pathParams?.length
    ? request.pathParams.map((param) => ({
        key: toPostmanTpl(param.name),
        value: toPostmanTpl(param.value),
      }))
    : undefined
  const definition = {
    ...converted.toJSON(),
    query,
    ...(variable ? { variable } : {}),
  }
  const url = new PmUrl(definition)
  const serialized = url.toJSON() as PostmanObject
  if (query.length === 0) delete serialized.query
  if (variable) {
    serialized.variable = variable
  } else {
    delete serialized.variable
  }
  return {
    raw: new PmUrl({ ...definition, variable: [] }).toString(),
    ...serialized,
  }
}

function postmanFormData(
  entries: FormEntry[],
  multipart: boolean,
): PostmanObject[] {
  return entries.map((entry) => {
    const result: PostmanObject = {
      key: toPostmanTpl(entry.name),
      disabled: !entry.enabled,
      type: entry.type,
    }
    if (multipart && entry.type === "file") {
      result.src = expandUserPath(toPostmanTpl(entry.value))
    } else {
      result.value = toPostmanTpl(entry.value)
    }
    return result
  })
}

function postmanBody(request: Request): PostmanObject | undefined {
  const type =
    request.bodyType ?? (request.body === undefined ? "none" : "json")
  if (type === "none") return undefined
  if (type === "json") {
    return {
      mode: "raw",
      raw: toPostmanTpl(request.body ?? ""),
      options: { raw: { language: "json" } },
    }
  }
  if (type === "xml") {
    return {
      mode: "raw",
      raw: toPostmanTpl(request.body ?? ""),
      options: { raw: { language: "xml" } },
    }
  }
  if (type === "urlencoded") {
    return {
      mode: "urlencoded",
      urlencoded: postmanFormData(request.formData ?? [], false),
    }
  }
  if (type === "multipart") {
    return {
      mode: "formdata",
      formdata: postmanFormData(request.formData ?? [], true),
    }
  }
  return {
    mode: "file",
    file: { src: expandUserPath(toPostmanTpl(request.filePath ?? "")) },
  }
}

function postmanRequest(
  request: Request,
  headers: Request["headers"],
): PostmanObject {
  const body = postmanBody(request)
  const auth = postmanAuth(request.auth)
  const result: PostmanObject = {
    method: request.method,
    header: Object.entries(headers).map(([key, entry]) => ({
      key: toPostmanTpl(key),
      value: toPostmanTpl(entry.value),
      disabled: !entry.enabled,
    })),
    url: postmanUrl(request),
  }
  if (body) result.body = body
  if (auth) result.auth = auth
  return result
}

export function exportPostman(collection: Collection): PostmanExportResult {
  let operationCount = 0

  const items = (entries: CollectionItem[]): PostmanObject[] =>
    entries.map((entry) => {
      if (entry.type === "folder") {
        const auth = folderAuth(entry.data.overrides?.auth)
        const result: PostmanObject = {
          name: entry.data.name,
          item: items(entry.data.children),
        }
        if (auth) result.auth = auth
        return result
      }

      operationCount++
      const effective = mergeFolderOverrides(
        entry.data,
        collection,
        entry.data.id,
      )
      return {
        name: entry.data.name,
        request: postmanRequest(entry.data, effective.headers),
        protocolProfileBehavior: {
          followRedirects: entry.data.followRedirects ?? true,
          maxRedirects: entry.data.maxRedirects ?? 5,
        },
      }
    })

  return {
    document: {
      info: { name: collection.name, schema: POSTMAN_SCHEMA },
      item: items(collection.items),
    },
    operationCount,
  }
}

export function exportPostmanEnvironment(
  environment: Environment,
): PostmanObject {
  const secretKeys = new Set(Object.keys(environment.secretVars ?? {}))
  const values = [
    ...Object.entries(environment.vars).map(([key]) => ({
      key,
      value: "",
      type: secretKeys.has(key) ? "secret" : "default",
      enabled: true,
    })),
    ...Object.entries(environment.disabledVars ?? {}).map(([key]) => ({
      key,
      value: "",
      type: secretKeys.has(key) ? "secret" : "default",
      enabled: false,
    })),
    ...Object.entries(environment.secretVars ?? {})
      .filter(
        ([key]) =>
          !Object.hasOwn(environment.vars, key) &&
          !Object.hasOwn(environment.disabledVars ?? {}, key),
      )
      .map(([key, status]) => ({
        key,
        value: "",
        type: "secret",
        enabled: status !== "disabled",
      })),
  ].sort(
    (a, b) =>
      a.key.localeCompare(b.key) || Number(b.enabled) - Number(a.enabled),
  )

  return {
    name: environment.name,
    values,
    _postman_variable_scope: "environment",
  }
}
