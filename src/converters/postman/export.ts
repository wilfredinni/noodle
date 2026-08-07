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

type PostmanObject = Record<string, unknown>

export interface PostmanExportResult {
  document: PostmanObject
  operationCount: number
}

const POSTMAN_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"

export function toPostmanTpl(value: string): string {
  return value.replace(/\$\$(\w+)|\$(\w+)/g, (_, dynamic, variable) =>
    dynamic ? `{{$${dynamic}}}` : `{{${variable}}}`,
  )
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
  const values = [
    ...Object.entries(environment.vars).map(([key]) => ({
      key,
      value: "",
      type: "default",
      enabled: true,
    })),
    ...Object.entries(environment.disabledVars ?? {}).map(([key]) => ({
      key,
      value: "",
      type: "default",
      enabled: false,
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
