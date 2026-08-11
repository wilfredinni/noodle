export type Method =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

export type BodyType = "none" | "json" | "multipart" | "urlencoded" | "binary"

export interface FormEntry {
  name: string
  value: string
  enabled: boolean
  type: "text" | "file"
}

export interface KvEntry {
  value: string
  enabled: boolean
}

export interface ParamEntry {
  name: string
  value: string
  enabled: boolean
}

export interface FolderMeta {
  name?: string
  seq?: number
}

export interface FolderOverrides {
  headers?: Record<string, KvEntry>
  auth?: Auth
}

export interface Folder {
  id: string
  name: string
  path: string
  seq?: number
  overrides?: FolderOverrides
  children: CollectionItem[]
}

export type CollectionItem =
  { type: "request"; data: Request } | { type: "folder"; data: Folder }

export type Auth =
  | { type: "none" }
  | { type: "inherit" }
  | { type: "bearer"; token: string }
  | { type: "basic"; user: string; pass: string }
  | {
      type: "api_key"
      key: string
      value: string
      placement: "header" | "query"
    }

export interface Request {
  id: string
  name: string
  method: Method
  url: string
  timeout: number
  followRedirects?: boolean
  maxRedirects?: number
  headers: Record<string, KvEntry>
  params: ParamEntry[]
  pathParams?: ParamEntry[]
  body?: string
  bodyType?: BodyType
  formData?: FormEntry[]
  filePath?: string
  auth?: Auth
  tls?: RequestTlsSettings
}

export interface Collection {
  id: string
  name: string
  items: CollectionItem[]
}

export interface Response {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
  network?: NetworkEvent[]
}

export type NetworkEventType =
  | "request"
  | "redirect"
  | "response"
  | "body"
  | "complete"
  | "error"
  | "proxy"
  | "tls"

export interface NetworkEvent {
  timeMs: number
  type: NetworkEventType
  message: string
}

export interface NetworkError extends Error {
  network?: NetworkEvent[]
}

export interface Environment {
  name: string
  vars: Record<string, string>
  color?: string
  disabledVars?: Record<string, string>
  secretVars?: Record<string, SecretStatus>
}

export type SecretStatus = "process" | "keychain" | "missing" | "disabled"

export interface TimelineEntry {
  id?: string
  timestamp: number
  envName?: string
  network?: NetworkEvent[]
  request: {
    id: string
    name: string
    method: Method
    url: string
    headers: Record<string, KvEntry>
    params: ParamEntry[]
    pathParams?: ParamEntry[]
    body?: string
    bodyRef?: TimelineBodyRef
    bodyTruncated?: boolean
    auth?: Auth
  }
  response?: {
    status: number
    statusText: string
    headers: Record<string, string>
    body?: string
    bodyRef?: TimelineBodyRef
    bodyTruncated?: boolean
    timeMs: number
    size: number
  }
  error?: {
    message: string
  }
}

export interface TimelineBodyRef {
  file: string
  encoding: "gzip"
  size: number
}

export interface CollectionSettings {
  collectionId?: string
  name?: string
  description?: string
  timelineMaxEntries?: number
  environment?: string
  proxy?: CollectionProxySettings
  tls?: CollectionTlsSettings
}

export interface RequestTlsSettings {
  verify?: boolean
}

export interface ClientCertificateProfile {
  host: string
  port?: number
  certFile: string
  keyFile: string
  secretId?: string
  enabled?: boolean
}

export interface CollectionTlsSettings {
  verify?: boolean
  caBundle?: string
  clientCertificates?: ClientCertificateProfile[]
}

export interface ProxySettings {
  mode: "custom"
  url: string
  bypass?: string[]
  auth?: boolean
}

export interface ProxyCredentials {
  username?: string
  password?: string
}

export type AppProxySettings =
  { mode: "system" } | { mode: "off" } | ProxySettings

export type CollectionProxySettings =
  { mode: "inherit" } | { mode: "off" } | ProxySettings
