export type Method =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

export type BodyType =
  "none" | "json" | "xml" | "multipart" | "urlencoded" | "binary"

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type AssertionValue = JsonValue

export type AssertionWithoutValueOperator =
  | "exists"
  | "notExists"
  | "isString"
  | "isNumber"
  | "isBoolean"
  | "isArray"
  | "isObject"
  | "isNull"
  | "notNull"

export type AssertionWithValueOperator =
  | "equals"
  | "notEquals"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "notContains"
  | "matches"

export type AssertionOperator =
  AssertionWithoutValueOperator | AssertionWithValueOperator

export type ResponseAssertion =
  | {
      expression: string
      operator: AssertionWithoutValueOperator
      value?: never
    }
  | {
      expression: string
      operator: AssertionWithValueOperator
      value: AssertionValue
    }

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
  tags?: string[]
  overrides?: FolderOverrides
  children: CollectionItem[]
}

export type CollectionItem =
  { type: "request"; data: Request } | { type: "folder"; data: Folder }

export type OAuth1SignatureMethod =
  | "HMAC-SHA1"
  | "HMAC-SHA256"
  | "HMAC-SHA512"
  | "RSA-SHA1"
  | "RSA-SHA256"
  | "RSA-SHA512"
  | "PLAINTEXT"

export type OAuth1Placement = "header" | "query" | "body"

export interface OAuth1Auth {
  type: "oauth1"
  consumer_key: string
  consumer_secret: string
  access_token: string
  access_token_secret: string
  signature_method: OAuth1SignatureMethod
  private_key: string
  private_key_type: "text" | "file"
  callback_url: string
  verifier: string
  timestamp: string
  nonce: string
  version: string
  realm: string
  placement: OAuth1Placement
  include_body_hash: boolean
}

export type OAuth2GrantType =
  "authorization_code" | "client_credentials" | "implicit" | "password"

export type OAuth2ClientAuthentication = "client_secret" | "client_assertion"

export type OAuth2ClientAssertionAlgorithm =
  | "HS256"
  | "HS384"
  | "HS512"
  | "RS256"
  | "RS384"
  | "RS512"
  | "PS256"
  | "PS384"
  | "PS512"
  | "ES256"
  | "ES384"
  | "ES512"

export interface OAuth2AdditionalParameter extends ParamEntry {
  placement: "query" | "header" | "body"
}

export interface OAuth2AdditionalParameters {
  authorization: OAuth2AdditionalParameter[]
  token: OAuth2AdditionalParameter[]
  refresh: OAuth2AdditionalParameter[]
}

export interface OAuth2Auth {
  type: "oauth2"
  grant_type: OAuth2GrantType
  authorization_url: string
  access_token_url: string
  refresh_token_url: string
  client_id: string
  client_secret: string
  username: string
  password: string
  scope: string
  audience: string
  redirect_uri: string
  credentials_id: string
  auto_fetch_token: boolean
  auto_refresh_token: boolean
  pkce: boolean
  pkce_method: "S256" | "plain"
  implicit_response_type: "token" | "id_token" | "token id_token"
  credentials_placement: "body" | "basic"
  client_authentication: OAuth2ClientAuthentication
  client_assertion_algorithm: OAuth2ClientAssertionAlgorithm
  client_assertion_key: string
  client_assertion_key_type: "text" | "file"
  client_assertion_issuer: string
  client_assertion_subject: string
  client_assertion_audience: string
  client_assertion_lifetime: number
  token_source: "access_token" | "id_token"
  token_placement: "header" | "query"
  token_header: string
  token_prefix: string
  token_query_key: string
  additional_parameters: OAuth2AdditionalParameters
}

export type Auth =
  | { type: "none" }
  | { type: "inherit" }
  | { type: "bearer"; token: string }
  | { type: "basic"; user: string; pass: string }
  | {
      type: "ntlm"
      username: string
      password: string
      domain: string
      workstation: string
    }
  | {
      type: "api_key"
      key: string
      value: string
      placement: "header" | "query"
    }
  | {
      type: "aws_sigv4"
      access_key: string
      secret_key: string
      region: string
      service: string
      session_token?: string
    }
  | OAuth1Auth
  | OAuth2Auth

export interface Request {
  id: string
  name: string
  method: Method
  url: string
  timeout: number
  tags?: string[]
  followRedirects?: boolean
  maxRedirects?: number
  sendCookies?: boolean
  headers: Record<string, KvEntry>
  params: ParamEntry[]
  pathParams?: ParamEntry[]
  body?: string
  bodyType?: BodyType
  formData?: FormEntry[]
  filePath?: string
  auth?: Auth
  tls?: RequestTlsSettings
  captures?: Record<string, string>
  assertions?: ResponseAssertion[]
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
  sentCookies?: CookiePair[]
  cookies?: ResponseCookie[]
}

export interface CookiePair {
  name: string
  value: string
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
  | "auth"

export interface NetworkEvent {
  timeMs: number
  type: NetworkEventType
  message: string
}

export interface NetworkError extends Error {
  network?: NetworkEvent[]
}

export interface ResponseCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires: string | null
  secure: boolean
  httpOnly: boolean
  sameSite?: "strict" | "lax" | "none"
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
    bodyType?: BodyType
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
  cookies?: { enabled?: boolean }
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
