import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { createServer, request } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import aws4 from "aws4"
import { load } from "js-yaml"
import { credentials, verifyAws } from "../../dev/auth"
import { signAwsRequest } from "../../src/requests/awsSigV4"
import { startDevServer, collectionDir } from "../../dev/server"
import { checkCollection } from "../../dev/check"
import { loadEnvironment } from "../../src/env/load"
import { CollectionCookieJar } from "../../src/cookies"

const running: Awaited<ReturnType<typeof startDevServer>>[] = []
const ephemeral = { http: 0, https: 0, alternate: 0, proxy: 0 }
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()))
})
const start = async () => {
  const server = await startDevServer(ephemeral)
  running.push(server)
  return server
}

describe("local development environment", () => {
  it("declares every example auth credential as a secret environment reference", async () => {
    const environment = await loadEnvironment(
      join(collectionDir, ".environments"),
      "development",
      { resolveSecrets: false },
    )
    const fields = new Set([
      "user",
      "pass",
      "username",
      "password",
      "token",
      "access_key",
      "secret_key",
      "session_token",
      "consumer_key",
      "consumer_secret",
      "access_token",
      "access_token_secret",
      "client_id",
      "client_secret",
      "client_assertion_key",
    ])
    for await (const file of new Bun.Glob("**/*.yml").scan(collectionDir)) {
      const document = load(
        await Bun.file(join(collectionDir, file)).text(),
      ) as { auth?: Record<string, unknown> }
      const auth = document?.auth
      if (!auth) continue
      for (const [key, value] of Object.entries(auth)) {
        if (!fields.has(key) && !(auth.type === "api_key" && key === "value"))
          continue
        if (
          key === "client_assertion_key" &&
          auth.client_assertion_key_type === "file"
        )
          continue
        if (!value) continue
        expect({ file, key, value }).toMatchObject({
          value: expect.stringMatching(/^\$\w+$/),
        })
        const name = (value as string).slice(1)
        expect(environment.secretVars?.[name]).toBe("missing")
        expect(environment.vars[name]).toBeUndefined()
      }
    }
  })

  it("runs the complete maintained collection, protocols and isolation checks", async () => {
    const server = await start()
    const jars: CollectionCookieJar[] = []
    const open = CollectionCookieJar.open
    const opened = spyOn(CollectionCookieJar, "open").mockImplementation(
      async (...args) => {
        const jar = await open(...args)
        jars.push(jar)
        return jar
      },
    )
    const priorPassword = process.env.auth_password
    process.env.auth_password = "ambient-password"
    const checked = await checkCollection(server).finally(() => {
      opened.mockRestore()
      const restoredPassword = process.env.auth_password
      if (priorPassword === undefined) delete process.env.auth_password
      else process.env.auth_password = priorPassword
      expect(restoredPassword).toBe("ambient-password")
    })
    expect(jars.length).toBeGreaterThan(0)
    for (const jar of jars) {
      expect(jar.file.startsWith(join(tmpdir(), "noodle-development-"))).toBe(
        true,
      )
      expect(await Bun.file(jar.file).exists()).toBe(false)
    }
    expect(checked.smoke.requestSuccesses).toBeGreaterThan(100)
    expect(checked.smoke.requestFailures).toBe(0)
    expect(checked.negative).toBeGreaterThan(25)
    expect(checked.datasets.map((result) => result.requestSuccesses)).toEqual([
      4, 4,
    ])
    expect(checked.protocols.oauthCallbacks).toBe(5)
    expect(checked.execution.persistence).toBe(true)
    expect(checked.execution.rollback).toBe(true)
    expect(
      checked.execution.iterations.map((result) => result.requestSuccesses),
    ).toEqual([4, 4])
  }, 20_000)

  it("resets state to the same known data and closes every listener", async () => {
    const server = await start()
    const initial = await (await fetch(`${server.urls.base_url}/posts`)).json()
    const created = await fetch(`${server.urls.base_url}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"title":"new"}',
    })
    expect(created.status).toBe(201)
    expect(
      await (await fetch(`${server.urls.base_url}/posts`)).json(),
    ).not.toEqual(initial)
    server.reset()
    expect(await (await fetch(`${server.urls.base_url}/posts`)).json()).toEqual(
      initial,
    )
    await server.close()
    for (const url of Object.values(server.urls)) {
      const probe = createServer()
      await new Promise<void>((resolve, reject) => {
        probe.once("error", reject)
        probe.listen(Number(new URL(url).port), "127.0.0.1", resolve)
      })
      await new Promise<void>((resolve) => probe.close(() => resolve()))
    }
    running.splice(running.indexOf(server), 1)
  })

  it("rolls back earlier listeners when a later service port is occupied", async () => {
    const reserved = createServer()
    await new Promise<void>((resolve) =>
      reserved.listen(0, "127.0.0.1", resolve),
    )
    const port = (reserved.address() as AddressInfo).port
    try {
      await expect(
        startDevServer({ ...ephemeral, proxy: port }),
      ).rejects.toThrow("Unable to start local development services")
    } finally {
      await new Promise<void>((resolve) => reserved.close(() => resolve()))
    }
    const restarted = await start()
    expect((await fetch(`${restarted.urls.base_url}/health`)).status).toBe(200)
  })

  it("rejects external proxy destinations without making an upstream connection", async () => {
    const server = await start()
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        server.urls.proxy_url,
        {
          path: "http://example.test:80/",
          headers: {
            "proxy-authorization": `Basic ${Buffer.from("proxy-user:proxy-pass").toString("base64")}`,
          },
        },
        (response) => {
          response.resume()
          response.on("end", () => resolve(response.statusCode!))
        },
      )
      req.on("error", reject)
      req.end()
    })
    expect(status).toBe(403)
    expect(server.requests).toHaveLength(0)
  })

  it("stops development services when the launched CLI exits", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        'import { runDevelopment } from "./dev/run.ts"; process.exitCode = await runDevelopment(["--help"], { http:0, https:0, alternate:0, proxy:0 })',
      ],
      {
        cwd: join(import.meta.dir, "../.."),
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" })
    expect(stdout).toContain("USAGE")
  }, 10_000)

  for (const exit of ["ctrl-c", "sigterm"] as const) {
    it(`closes the actual watched TUI and launcher on ${exit}`, async () => {
      // Browse mode avoids registering a test collection in the user's config.
      const dir = await mkdtemp(join(tmpdir(), "noodle-dev-shutdown-"))
      await writeFile(
        join(dir, "request.yml"),
        "name: Shutdown probe\nmethod: GET\nurl: http://127.0.0.1:4400/echo\nbody_type: json\nbody: '{}'\n",
      )
      const child = Bun.spawn(
        [
          process.execPath,
          "--no-orphans",
          "-e",
          `import { runDevelopment } from "./dev/run.ts"; process.exitCode = await runDevelopment(["--collection", ${JSON.stringify(dir)}], { http:0, https:0, alternate:0, proxy:0 })`,
        ],
        {
          cwd: join(import.meta.dir, "../.."),
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const ready = Promise.withResolvers<void>()
      const output = (async () => {
        let text = ""
        for await (const bytes of child.stdout) {
          text += new TextDecoder().decode(bytes)
          if (text.includes("Shutdown probe")) ready.resolve()
        }
        ready.reject(Error("TUI exited before rendering the request"))
        return text
      })()
      const errors = new Response(child.stderr).text()
      const deadline = setTimeout(() => child.kill("SIGKILL"), 5_000)
      try {
        await ready.promise
        if (exit === "ctrl-c") {
          child.stdin.write("\x03")
          child.stdin.flush()
        } else child.kill("SIGTERM")
        const [stdout, stderr, status] = await Promise.all([
          output,
          errors,
          child.exited,
        ])
        expect({ status, stderr }).toEqual({ status: 0, stderr: "" })
        expect(stdout).toContain("\x1b[?1049l")
      } finally {
        clearTimeout(deadline)
        child.kill("SIGKILL")
        await child.exited
        await rm(dir, { recursive: true, force: true })
      }
    }, 10_000)
  }

  it("verifies received AWS payload bytes and rejects retained signatures on changed bodies", async () => {
    const url = "http://127.0.0.1:4400/auth/aws"
    const body = Buffer.from([0, 255, 254, 253])
    const auth = {
      type: "aws_sigv4" as const,
      access_key: credentials.awsKey,
      secret_key: credentials.awsSecret,
      region: "us-east-1",
      service: "execute-api",
      session_token: credentials.awsSession,
    }
    const signed = signAwsRequest(url, { method: "POST", body }, auth)
    expect(await verifyAws(new Request(url, signed))).toBe(true)
    expect(
      await verifyAws(
        new Request(url, { ...signed, body: Buffer.from([0, 1]) }),
      ),
    ).toBe(false)
    const hashed = aws4.sign(
      {
        host: "127.0.0.1:4400",
        path: "/auth/aws",
        method: "POST",
        body: "original",
        service: "execute-api",
        region: "us-east-1",
        headers: {
          "x-amz-content-sha256": createHash("sha256")
            .update("original")
            .digest("hex"),
        },
      },
      {
        accessKeyId: credentials.awsKey,
        secretAccessKey: credentials.awsSecret,
      },
    )
    const init = {
      method: "POST",
      headers: new Headers(hashed.headers as HeadersInit),
      body: "original",
    }
    expect(await verifyAws(new Request(url, init))).toBe(true)
    expect(
      await verifyAws(new Request(url, { ...init, body: "tampered" })),
    ).toBe(false)
  })

  it("omits query credentials and rejected URL credentials from the proxy ledger", async () => {
    const server = await start()
    for (const destination of [
      `${server.urls.base_url}/echo?access_token=private-query`,
      server.urls.base_url.replace("//", "//private-user:private-pass@") +
        "/echo",
    ]) {
      await new Promise<void>((resolve, reject) => {
        const req = request(
          server.urls.proxy_url,
          {
            path: destination,
            headers: {
              "proxy-authorization": `Basic ${Buffer.from("proxy-user:proxy-pass").toString("base64")}`,
            },
          },
          (response) => {
            response.resume()
            response.on("end", resolve)
          },
        )
        req.on("error", reject)
        req.end()
      })
    }
    const ledger = JSON.stringify(
      await (await fetch(`${server.urls.base_url}/requests`)).json(),
    )
    expect(ledger).not.toContain("private-query")
    expect(ledger).not.toContain("private-user")
    expect(ledger).not.toContain("private-pass")
  })
})
