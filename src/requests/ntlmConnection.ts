import { connect as netConnect, isIP, type Socket } from "node:net"
import {
  connect as tlsConnect,
  type ConnectionOptions,
  type TLSSocket,
} from "node:tls"
import type { Duplex } from "node:stream"
import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
  zstdDecompressSync,
} from "node:zlib"

export interface NtlmConnection {
  request(headers: Headers): Promise<Response>
  close(): void
}

export async function createNtlmConnection(
  url: string,
  init: RequestInit,
  proxyUrl?: string,
  tls?: BunFetchRequestInitTLS,
): Promise<NtlmConnection> {
  const target = new URL(url)
  if (init.signal?.aborted) throw abortError()
  const serialized = new Request(url, { ...init, signal: undefined })
  const body =
    init.body === undefined || init.body === null
      ? undefined
      : Buffer.from(await serialized.arrayBuffer())
  const baseHeaders = new Headers(serialized.headers)
  baseHeaders.set("host", target.host)
  baseHeaders.set("connection", "keep-alive")
  baseHeaders.delete("proxy-authorization")
  baseHeaders.delete("transfer-encoding")
  if (body === undefined) baseHeaders.delete("content-length")
  else baseHeaders.set("content-length", String(body.length))

  const tlsOptions = await nodeTlsOptions(target, tls)
  const { socket, reader } = proxyUrl
    ? await openTunnel(target, new URL(proxyUrl), tlsOptions, init.signal)
    : await openDirect(target, tlsOptions, init.signal)
  let pending: Promise<unknown> = Promise.resolve()

  return {
    request(headers) {
      const requestHeaders = new Headers(baseHeaders)
      headers.forEach((value, name) => requestHeaders.set(name, value))
      requestHeaders.set("host", target.host)
      requestHeaders.set("connection", "keep-alive")
      requestHeaders.delete("proxy-authorization")
      requestHeaders.delete("transfer-encoding")
      if (body === undefined) requestHeaders.delete("content-length")
      else requestHeaders.set("content-length", String(body.length))
      const response = pending.then(() =>
        requestOnSocket(
          socket,
          reader,
          target,
          init.method ?? "GET",
          requestHeaders,
          body,
        ),
      )
      pending = response
      return response
    },
    close() {
      socket.destroy()
    },
  }
}

async function requestOnSocket(
  socket: Duplex,
  reader: SocketReader,
  target: URL,
  method: string,
  headers: Headers,
  body: Buffer | undefined,
): Promise<Response> {
  const lines = [`${method} ${target.pathname}${target.search} HTTP/1.1`]
  headers.forEach((value, name) => lines.push(`${name}: ${value}`))
  const head = Buffer.from(`${lines.join("\r\n")}\r\n\r\n`, "latin1")
  await write(socket, body === undefined ? head : Buffer.concat([head, body]))
  return readResponse(reader, method)
}

async function readResponse(
  reader: SocketReader,
  method: string,
): Promise<Response> {
  let parsed = await readResponseHead(reader)
  while (parsed.status >= 100 && parsed.status < 200 && parsed.status !== 101) {
    parsed = await readResponseHead(reader)
  }

  let body: Buffer
  if (
    method === "HEAD" ||
    (parsed.status >= 100 && parsed.status < 200) ||
    parsed.status === 204 ||
    parsed.status === 304
  ) {
    body = Buffer.alloc(0)
  } else if (hasChunkedEncoding(parsed.headers)) {
    body = await readChunkedBody(reader)
  } else {
    const contentLength = parsed.headers.get("content-length")
    body =
      contentLength === null
        ? await reader.readToEnd()
        : await reader.readExact(parseContentLength(contentLength))
  }

  body = decodeBody(body, parsed.headers)
  return new Response(body.length === 0 ? null : new Uint8Array(body), {
    status: parsed.status,
    statusText: parsed.statusText,
    headers: parsed.headers,
  })
}

async function readResponseHead(reader: SocketReader): Promise<{
  status: number
  statusText: string
  headers: Headers
}> {
  const raw = (await reader.readThrough(Buffer.from("\r\n\r\n"))).toString(
    "latin1",
  )
  const lines = raw.slice(0, -4).split("\r\n")
  const status = lines.shift()?.match(/^HTTP\/1\.[01] (\d{3})(?: (.*))?$/)
  if (!status) throw new Error("invalid HTTP response status line")
  const headers = new Headers()
  for (const line of lines) {
    const separator = line.indexOf(":")
    if (separator < 1) throw new Error("invalid HTTP response header")
    headers.append(line.slice(0, separator), line.slice(separator + 1).trim())
  }
  return {
    status: Number(status[1]),
    statusText: status[2] ?? "",
    headers,
  }
}

function hasChunkedEncoding(headers: Headers): boolean {
  return (headers.get("transfer-encoding") ?? "")
    .split(",")
    .some((value) => value.trim().toLowerCase() === "chunked")
}

function parseContentLength(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("invalid HTTP content length")
  const length = Number(value)
  if (!Number.isSafeInteger(length))
    throw new Error("invalid HTTP content length")
  return length
}

async function readChunkedBody(reader: SocketReader): Promise<Buffer> {
  const chunks: Buffer[] = []
  while (true) {
    const line = (await reader.readThrough(Buffer.from("\r\n")))
      .subarray(0, -2)
      .toString("ascii")
    const sizeText = line.split(";", 1)[0]!
    if (!/^[0-9a-f]+$/i.test(sizeText)) {
      throw new Error("invalid HTTP chunk size")
    }
    const size = Number.parseInt(sizeText, 16)
    if (size === 0) {
      while ((await reader.readThrough(Buffer.from("\r\n"))).length > 2) {
        // Consume trailers.
      }
      return Buffer.concat(chunks)
    }
    chunks.push(await reader.readExact(size))
    if (!(await reader.readExact(2)).equals(Buffer.from("\r\n"))) {
      throw new Error("invalid HTTP chunk terminator")
    }
  }
}

function decodeBody(body: Buffer, headers: Headers): Buffer {
  const encodings = (headers.get("content-encoding") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (encodings.length === 0) return body
  for (const encoding of encodings.reverse()) {
    if (encoding === "gzip") body = gunzipSync(body)
    else if (encoding === "deflate") body = inflateSync(body)
    else if (encoding === "br") body = brotliDecompressSync(body)
    else if (encoding === "zstd") body = zstdDecompressSync(body)
    else throw new Error(`unsupported response content encoding: ${encoding}`)
  }
  headers.delete("content-encoding")
  headers.delete("content-length")
  return body
}

async function openDirect(
  target: URL,
  tls: ConnectionOptions,
  signal: AbortSignal | null | undefined,
): Promise<{ socket: Duplex; reader: SocketReader }> {
  const socket =
    target.protocol === "https:"
      ? await connectTls(target, tls, signal)
      : await connectTcp(target.hostname, Number(target.port || 80), signal)
  return { socket, reader: new SocketReader(socket) }
}

async function openTunnel(
  target: URL,
  proxy: URL,
  tls: ConnectionOptions,
  signal: AbortSignal | null | undefined,
): Promise<{ socket: Duplex; reader: SocketReader }> {
  if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
    throw new Error(`unsupported proxy protocol: ${proxy.protocol}`)
  }
  const proxySocket =
    proxy.protocol === "https:"
      ? await connectTls(proxy, proxyTlsOptions(proxy), signal)
      : await connectTcp(proxy.hostname, Number(proxy.port || 80), signal)
  const proxyReader = new SocketReader(proxySocket)
  const targetPort =
    target.port || (target.protocol === "https:" ? "443" : "80")
  const authority = `${target.hostname}:${targetPort}`
  const headers = [`CONNECT ${authority} HTTP/1.1`, `Host: ${authority}`]
  if (proxy.username || proxy.password) {
    const username = decodeURIComponent(proxy.username)
    const password = decodeURIComponent(proxy.password)
    headers.push(
      `Proxy-Authorization: Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    )
  }
  await write(proxySocket, Buffer.from(`${headers.join("\r\n")}\r\n\r\n`))
  const response = await readResponseHead(proxyReader)
  if (response.status !== 200) {
    proxySocket.destroy()
    throw new Error(`proxy CONNECT failed with ${response.status}`)
  }
  if (target.protocol !== "https:") {
    return { socket: proxySocket, reader: proxyReader }
  }

  proxyReader.release()
  const socket = await connectTlsOverSocket(proxySocket, tls, signal)
  return { socket, reader: new SocketReader(socket) }
}

function connectTcp(
  hostname: string,
  port: number,
  signal: AbortSignal | null | undefined,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: unbracket(hostname), port }, () =>
      resolve(socket),
    )
    bindAbort(socket, signal)
    socket.once("error", reject)
  })
}

function connectTls(
  target: URL,
  options: ConnectionOptions,
  signal: AbortSignal | null | undefined,
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      {
        ...options,
        host: unbracket(target.hostname),
        port: Number(target.port || 443),
      },
      () => resolve(socket),
    )
    bindAbort(socket, signal)
    socket.once("error", reject)
  })
}

function connectTlsOverSocket(
  socket: Duplex,
  options: ConnectionOptions,
  signal: AbortSignal | null | undefined,
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tlsConnect({ ...options, socket }, () => resolve(secure))
    bindAbort(secure, signal)
    secure.once("error", reject)
  })
}

function proxyTlsOptions(proxy: URL): ConnectionOptions {
  const hostname = unbracket(proxy.hostname)
  return isIP(hostname) ? {} : { servername: hostname }
}

function bindAbort(
  socket: Duplex,
  signal: AbortSignal | null | undefined,
): void {
  if (!signal) return
  const abort = () => socket.destroy(abortError())
  if (signal.aborted) abort()
  else signal.addEventListener("abort", abort, { once: true })
  socket.once("close", () => signal.removeEventListener("abort", abort))
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError")
}

function write(socket: Duplex, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (error) => (error ? reject(error) : resolve()))
  })
}

class SocketReader {
  private buffer = Buffer.alloc(0)
  private ended = false
  private error: Error | undefined
  private wake: (() => void) | undefined

  constructor(private readonly socket: Duplex) {
    socket.on("data", this.onData)
    socket.once("end", this.onEnd)
    socket.once("error", this.onError)
  }

  async readThrough(delimiter: Buffer): Promise<Buffer> {
    while (true) {
      const offset = this.buffer.indexOf(delimiter)
      if (offset >= 0) return this.take(offset + delimiter.length)
      await this.more()
    }
  }

  async readExact(length: number): Promise<Buffer> {
    while (this.buffer.length < length) await this.more()
    return this.take(length)
  }

  async readToEnd(): Promise<Buffer> {
    while (!this.ended && !this.error) await this.more()
    if (this.error) throw this.error
    return this.take(this.buffer.length)
  }

  release(): void {
    this.socket.off("data", this.onData)
    this.socket.off("end", this.onEnd)
    this.socket.off("error", this.onError)
    if (this.buffer.length > 0 && "unshift" in this.socket) {
      ;(this.socket as Socket).unshift(this.buffer)
    }
    this.buffer = Buffer.alloc(0)
  }

  private take(length: number): Buffer {
    const value = this.buffer.subarray(0, length)
    this.buffer = this.buffer.subarray(length)
    return value
  }

  private async more(): Promise<void> {
    if (this.error) throw this.error
    if (this.ended)
      throw new Error("HTTP connection closed before response completed")
    await new Promise<void>((resolve) => {
      this.wake = resolve
    })
  }

  private onData = (chunk: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)])
    this.resume()
  }

  private onEnd = () => {
    this.ended = true
    this.resume()
  }

  private onError = (error: Error) => {
    this.error = error
    this.resume()
  }

  private resume(): void {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
}

async function nodeTlsOptions(
  target: URL,
  options: BunFetchRequestInitTLS | undefined,
): Promise<ConnectionOptions> {
  const result: ConnectionOptions = { ALPNProtocols: ["http/1.1"] }
  const servername = unbracket(options?.serverName ?? target.hostname)
  if (!isIP(servername)) result.servername = servername
  if (options?.rejectUnauthorized !== undefined) {
    result.rejectUnauthorized = options.rejectUnauthorized
  }
  if (options?.passphrase !== undefined) result.passphrase = options.passphrase
  if (options?.checkServerIdentity !== undefined) {
    result.checkServerIdentity = options.checkServerIdentity
  }
  if (options?.ciphers !== undefined) result.ciphers = options.ciphers
  if (options?.secureOptions !== undefined) {
    result.secureOptions = options.secureOptions
  }
  if (options?.ca !== undefined) result.ca = await tlsValue(options.ca)
  if (options?.cert !== undefined) result.cert = await tlsValue(options.cert)
  if (options?.key !== undefined) result.key = await tlsValue(options.key)
  return result
}

type TlsValue = NonNullable<Bun.TLSOptions["ca"]>
type TlsScalar = Exclude<TlsValue, unknown[]>

async function tlsValue(
  value: TlsValue,
): Promise<string | Buffer | (string | Buffer)[]> {
  if (Array.isArray(value)) return Promise.all(value.map(tlsScalar))
  return tlsScalar(value)
}

async function tlsScalar(value: TlsScalar): Promise<string | Buffer> {
  if (typeof value === "string") return value
  if (value instanceof Blob) return Buffer.from(await value.arrayBuffer())
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  return Buffer.from(new Uint8Array(value))
}

function unbracket(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname
}
