export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"

export type BodyType = "json" | "multipart" | "urlencoded" | "binary"

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

export type Auth =
  | { type: "none" }
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
  params: Record<string, KvEntry>
  body?: string
  bodyType?: BodyType
  formData?: FormEntry[]
  filePath?: string
  auth?: Auth
}

export interface Collection {
  id: string
  name: string
  requests: Request[]
}

export interface Response {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
}

export interface Environment {
  name: string
  vars: Record<string, string>
  color?: string
  disabledVars?: Record<string, string>
}

export interface TimelineEntry {
  timestamp: number
  envName?: string
  request: {
    id: string
    name: string
    method: Method
    url: string
    headers: Record<string, KvEntry>
    params: Record<string, KvEntry>
    body?: string
    auth?: Auth
  }
  response?: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
    timeMs: number
    size: number
  }
  error?: {
    message: string
  }
}

export interface CollectionSettings {
  environment?: string
}
