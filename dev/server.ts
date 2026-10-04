import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { createServer as createHttpsServer } from "node:https"
import { connect, type AddressInfo, type Socket } from "node:net"
import type { TLSSocket } from "node:tls"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createAuthService, credentials } from "./auth"
import { createNtlmHandler } from "./ntlm"

export const collectionDir = join(import.meta.dir, "collection")
export const defaultPorts = {
  http: 4400,
  https: 4401,
  alternate: 4402,
  proxy: 4403,
}
const files = join(collectionDir, "fixtures")
const initialUsers = [
  {
    id: 1,
    name: "Development User",
    username: "Bret",
    email: "Sincere@april.biz",
    address: { city: "Gwenborough" },
  },
  {
    id: 2,
    name: "Second User",
    username: "Antonette",
    email: "Shanna@melissa.tv",
    address: { city: "Wisokyburgh" },
  },
]

export async function startDevServer(
  ports: typeof defaultPorts & { selfsigned?: number } = defaultPorts,
) {
  const servers: Server[] = []
  const sockets = new Set<Socket>()
  const requests: { method: string; path: string }[] = []
  const proxyRequests: {
    method: string
    target: string
    authenticated: boolean
  }[] = []
  let origin = "",
    alternate = ""
  let resources: Record<string, Record<string, unknown>[]>
  const auth = createAuthService(() => origin)
  const reset = () => {
    resources = {
      users: structuredClone(initialUsers),
      posts: [
        {
          id: 1,
          userId: 1,
          title: "Local development post",
          body: "A predictable response",
        },
        {
          id: 2,
          userId: 1,
          title: "Second post",
          body: "External script fixture",
        },
      ],
      comments: [
        {
          id: 1,
          postId: 1,
          name: "Local comment",
          email: "dev@example.test",
          body: "Comment body",
        },
      ],
      albums: [{ id: 1, userId: 1, title: "Local album" }],
      photos: [
        {
          id: 1,
          albumId: 1,
          title: "Local image",
          url: `${origin}/image/png`,
          thumbnailUrl: `${origin}/image/png`,
        },
      ],
      todos: [{ id: 1, userId: 1, title: "Develop Noodle", completed: false }],
    }
    auth.reset()
    requests.length = 0
    proxyRequests.length = 0
  }
  reset()
  const ntlm = createNtlmHandler()
  async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname.replace(/\/$/, "") || "/"
    requests.push({ method: request.method, path })
    if (path === "/health") return Response.json({ ok: true })
    if (path === "/reset" && request.method === "POST") {
      reset()
      return Response.json({ reset: true })
    }
    if (path === "/requests") return Response.json({ requests, proxyRequests })
    const authorized = await auth.handle(request)
    if (authorized) return authorized
    if (path === "/redirect/relative")
      return new Response(null, { status: 302, headers: { location: "/echo" } })
    if (path === "/redirect/cross-origin")
      return Response.redirect(`${alternate}/echo`, 302)
    if (path === "/redirect/loop")
      return new Response(null, {
        status: 302,
        headers: { location: "/redirect/loop" },
      })
    if (path === "/redirect/preserve")
      return new Response(null, { status: 307, headers: { location: "/echo" } })
    if (path.startsWith("/status/")) {
      const status = Number(path.split("/").at(-1))
      if (!Number.isInteger(status) || status < 200 || status > 599)
        return new Response("Invalid status", { status: 400 })
      return new Response(
        [204, 205, 304].includes(status) ? null : JSON.stringify({ status }),
        { status, headers: { "content-type": "application/json" } },
      )
    }
    if (path.startsWith("/delay/")) {
      const ms = Number(path.split("/").at(-1))
      if (!Number.isFinite(ms) || ms < 0 || ms > 30_000)
        return new Response("Invalid delay", { status: 400 })
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms)
        request.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true },
        )
      })
      return Response.json({ delayed: ms })
    }
    if (path === "/response/json")
      return Response.json({
        string: "Noodle",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2],
        object: { nested: "value" },
      })
    if (path === "/response/invalid-json")
      return new Response('{"broken":', {
        headers: { "content-type": "application/json" },
      })
    if (path === "/response/xml")
      return new Response(
        '<response><name>Noodle</name><item id="1">Local</item></response>',
        { headers: { "content-type": "application/xml" } },
      )
    if (path === "/response/text")
      return new Response("Noodle local response\nUnicode: ñ 日 🍜\n", {
        headers: { "content-type": "text/plain" },
      })
    if (path === "/response/empty") return new Response(null, { status: 204 })
    if (path === "/response/large")
      return Response.json({
        items: Array.from({ length: 20_000 }, (_, id) => ({
          id,
          value: "Noodle development response",
        })),
      })
    if (path === "/response/headers")
      return new Response("Repeated headers", {
        headers: [
          ["x-repeat", "one"],
          ["x-repeat", "two"],
          ["set-cookie", "first=one; Path=/"],
          ["set-cookie", "second=two; Path=/"],
        ],
      })
    if (path === "/image/png")
      return new Response(readFileSync(join(files, "image.png")), {
        headers: {
          "content-type": "image/png",
          "content-disposition": 'attachment; filename="noodle.png"',
        },
      })
    if (path === "/download")
      return new Response(readFileSync(join(files, "upload.txt")), {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="upload.txt"',
        },
      })
    if (path === "/cookies/set")
      return Response.json(
        { cookies: true },
        {
          headers: [
            [
              "set-cookie",
              "session=noodle-session; Path=/; HttpOnly; SameSite=Lax",
            ],
            ["set-cookie", "scoped=local; Path=/cookies"],
            ["set-cookie", "expired=gone; Max-Age=0; Path=/"],
            ["set-cookie", "secure=local; Secure; Path=/; SameSite=Strict"],
          ],
        },
      )
    if (path === "/cookies/echo")
      return Response.json({ cookie: request.headers.get("cookie") ?? "" })
    if (path === "/cookies/delete")
      return Response.json(
        { deleted: true },
        { headers: { "set-cookie": "session=; Max-Age=0; Path=/" } },
      )
    if (path === "/echo" || path.startsWith("/echo/") || path === "/mtls") {
      const bytes = new Uint8Array(await request.clone().arrayBuffer())
      const text = new TextDecoder().decode(bytes)
      let json: unknown = null,
        form: Record<string, unknown> = {}
      const contentType = request.headers.get("content-type") ?? ""
      if (contentType.includes("application/json")) {
        try {
          json = JSON.parse(text)
        } catch {
          /* Invalid JSON is deliberately echoable. */
        }
      }
      if (contentType.includes("application/x-www-form-urlencoded"))
        form = Object.fromEntries(new URLSearchParams(text))
      if (contentType.includes("multipart/form-data")) {
        const parsed = await request.formData()
        for (const [key, value] of parsed)
          form[key] =
            typeof value === "string"
              ? value
              : {
                  name: value.name,
                  size: value.size,
                  type: value.type,
                  text: await value.text(),
                }
      }
      return Response.json({
        method: request.method,
        path,
        args: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(request.headers),
        data: text,
        base64: Buffer.from(bytes).toString("base64"),
        size: bytes.length,
        json,
        form,
        ...(path === "/mtls" ? { mutual: true } : {}),
      })
    }
    const parts = path.split("/").filter(Boolean)
    const resource = parts[0]!,
      list = resources![resource]
    if (list) {
      const id = parts[1] ? Number(parts[1]) : undefined
      if (parts.length === 3 && resources![parts[2]!]) {
        const foreignKey =
          resource === "users"
            ? "userId"
            : resource === "posts"
              ? "postId"
              : "albumId"
        return Response.json(
          resources![parts[2]!]!.filter((item) => item[foreignKey] === id),
        )
      }
      const index = list.findIndex((item) => item.id === id)
      if (request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>
        const created = {
          ...body,
          id: Math.max(0, ...list.map((item) => Number(item.id))) + 1,
        }
        list.push(created)
        return Response.json(created, { status: 201 })
      }
      if (request.method === "PUT" || request.method === "PATCH") {
        if (index < 0)
          return Response.json({ error: "Not found" }, { status: 404 })
        list[index] = {
          ...(request.method === "PATCH" ? list[index] : {}),
          ...((await request.json()) as Record<string, unknown>),
          id,
        }
        return Response.json(list[index])
      }
      if (request.method === "DELETE") {
        if (index < 0) return new Response(null, { status: 404 })
        list.splice(index, 1)
        return new Response(null, { status: 204 })
      }
      if (id !== undefined)
        return Response.json(index < 0 ? { error: "Not found" } : list[index], {
          status: index < 0 ? 404 : 200,
        })
      return Response.json(
        list.filter((item) =>
          [...url.searchParams].every(
            ([key, value]) => String(item[key]) === value,
          ),
        ),
      )
    }
    return Response.json({ error: "Not found", path }, { status: 404 })
  }
  const track = (server: Server) => {
    servers.push(server)
    server.on("connection", (socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
      socket.on("error", () => {})
    })
  }
  async function close() {
    for (const socket of sockets) socket.destroy()
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    )
  }
  const listener =
    (secure = false) =>
    async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname
      if (pathname === "/auth/ntlm") {
        req.resume()
        ntlm(req, res)
        return
      }
      if (pathname === "/disconnect") {
        req.socket.destroy()
        return
      }
      if (
        pathname === "/mtls" &&
        (!secure || !(req.socket as TLSSocket).authorized)
      ) {
        res.writeHead(403)
        res.end("Valid client certificate required")
        return
      }
      const controller = new AbortController()
      res.on("close", () => controller.abort())
      try {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk))
          size += chunks.at(-1)!.length
          if (size > 10 * 1024 * 1024) {
            res.writeHead(413)
            res.end()
            return
          }
        }
        const host = req.headers.host ?? "localhost"
        const headers = new Headers()
        for (let index = 0; index < req.rawHeaders.length; index += 2)
          headers.append(req.rawHeaders[index]!, req.rawHeaders[index + 1]!)
        const request = new Request(
          `${secure ? "https" : "http"}://${host}${req.url}`,
          {
            method: req.method,
            headers,
            ...(!["GET", "HEAD"].includes(req.method ?? "GET")
              ? { body: Buffer.concat(chunks) }
              : {}),
            signal: controller.signal,
          },
        )
        const response = await handler(request)
        const outgoing: Record<string, string | string[]> = Object.fromEntries(
          response.headers,
        )
        const cookies = response.headers.getSetCookie()
        if (cookies.length) outgoing["set-cookie"] = cookies
        res.writeHead(response.status, outgoing)
        res.end(
          req.method === "HEAD"
            ? undefined
            : Buffer.from(await response.arrayBuffer()),
        )
      } catch (error) {
        if (!res.destroyed) {
          res.writeHead(400, { "content-type": "application/json" })
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Invalid request",
            }),
          )
        }
      }
    }
  async function listen(server: Server, port: number) {
    track(server)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(port, "127.0.0.1", resolve)
    })
    return (server.address() as AddressInfo).port
  }
  try {
    const httpPort = await listen(createServer(listener()), ports.http)
    origin = `http://127.0.0.1:${httpPort}`
    const httpsPort = await listen(
      createHttpsServer(
        {
          key: readFileSync(join(files, "tls/server-key.pem")),
          cert: readFileSync(join(files, "tls/server.pem")),
          ca: readFileSync(join(files, "tls/ca.pem")),
          requestCert: true,
          rejectUnauthorized: false,
        },
        listener(true),
      ),
      ports.https,
    )
    const alternatePort = await listen(
      createServer(listener()),
      ports.alternate,
    )
    alternate = `http://127.0.0.1:${alternatePort}`
    const selfsignedPort = await listen(
      createHttpsServer(
        {
          key: readFileSync(join(files, "tls/selfsigned-key.pem")),
          cert: readFileSync(join(files, "tls/selfsigned.pem")),
        },
        listener(true),
      ),
      ports.selfsigned ?? (ports.http === 0 ? 0 : 4404),
    )
    const proxy = createServer()
    const proxyAuth = `Basic ${Buffer.from(`${credentials.proxyUser}:${credentials.proxyPassword}`).toString("base64")}`
    const allowed = (url: URL) =>
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      [httpPort, httpsPort, alternatePort, selfsignedPort].includes(
        Number(url.port),
      ) &&
      !url.username &&
      !url.password
    proxy.on("request", (req, res) => {
      let target: URL
      try {
        target = new URL(req.url ?? "")
      } catch {
        res.writeHead(400)
        res.end()
        return
      }
      const authenticated = req.headers["proxy-authorization"] === proxyAuth
      proxyRequests.push({
        method: req.method ?? "GET",
        target: `${target.origin}${target.pathname}`,
        authenticated,
      })
      if (!authenticated) {
        res.writeHead(407, {
          "proxy-authenticate": 'Basic realm="Noodle development"',
        })
        res.end()
        return
      }
      if (target.protocol !== "http:" || !allowed(target)) {
        res.writeHead(403)
        res.end()
        return
      }
      const headers = { ...req.headers, host: target.host }
      delete headers["proxy-authorization"]
      const upstream = httpRequest(
        target,
        { method: req.method, headers },
        (incoming) => {
          res.writeHead(incoming.statusCode ?? 502, incoming.headers)
          incoming.pipe(res)
        },
      )
      upstream.on("socket", (socket) => {
        sockets.add(socket)
        socket.on("close", () => sockets.delete(socket))
      })
      res.on("close", () => upstream.destroy())
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502)
        res.end()
      })
      req.pipe(upstream)
    })
    proxy.on("connect", (req, client, head) => {
      let target: URL
      try {
        target = new URL(`http://${req.url}`)
      } catch {
        client.end("HTTP/1.1 400 Bad Request\r\n\r\n")
        return
      }
      const authenticated = req.headers["proxy-authorization"] === proxyAuth
      proxyRequests.push({
        method: "CONNECT",
        target: target.host,
        authenticated,
      })
      if (!authenticated) {
        client.end(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Noodle development"\r\nConnection: close\r\n\r\n',
        )
        return
      }
      if (!allowed(target)) {
        client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
        return
      }
      const upstream = connect(Number(target.port), "127.0.0.1", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head.length) upstream.write(head)
        client.pipe(upstream)
        upstream.pipe(client)
      })
      sockets.add(upstream)
      upstream.on("close", () => sockets.delete(upstream))
      upstream.on("error", () => client.destroy())
      client.on("close", () => upstream.destroy())
      client.on("error", () => upstream.destroy())
    })
    const proxyPort = await listen(proxy, ports.proxy)
    reset()
    return {
      urls: {
        base_url: origin,
        https_url: `https://localhost:${httpsPort}`,
        alternate_url: alternate,
        proxy_url: `http://127.0.0.1:${proxyPort}`,
        selfsigned_url: `https://localhost:${selfsignedPort}`,
      },
      reset,
      close,
      requests,
      proxyRequests,
    }
  } catch (error) {
    await close()
    throw new Error(
      "Unable to start local development services; check the configured ports",
      { cause: error },
    )
  }
}

if (import.meta.main) {
  const server = await startDevServer()
  console.log("Noodle development services", server.urls)
  const stop = async () => {
    await server.close()
    process.exit(0)
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
}
