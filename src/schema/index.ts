export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"

export interface KvEntry {
  value: string
  enabled: boolean
}

export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; user: string; pass: string }

export interface Request {
  id: string
  name: string
  method: Method
  url: string
  headers: Record<string, KvEntry>
  params: Record<string, KvEntry>
  body?: string
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
}
