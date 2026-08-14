export type OAuthBrowserLauncher = (url: string) => Promise<void>

let browserFlowActive = false

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  )
}

export function validateLoopbackRedirect(value: string): URL {
  let redirect: URL
  try {
    redirect = new URL(value)
  } catch (e) {
    throw new Error("OAuth 2 redirect_uri must be a valid loopback URL", {
      cause: e,
    })
  }
  if (
    redirect.protocol !== "http:" ||
    !isLoopbackHost(redirect.hostname) ||
    !redirect.port ||
    redirect.pathname === "/" ||
    redirect.username !== "" ||
    redirect.password !== "" ||
    redirect.hash !== ""
  ) {
    throw new Error(
      "OAuth 2 redirect_uri must use http, a loopback host, an explicit port, and a callback path",
    )
  }
  return redirect
}

export async function openSystemBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["explorer.exe", url]
        : ["xdg-open", url]
  let processHandle: ReturnType<typeof Bun.spawn>
  try {
    processHandle = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" })
  } catch (e) {
    throw new Error("Unable to open the system browser", { cause: e })
  }
  if ((await processHandle.exited) !== 0) {
    throw new Error("Unable to open the system browser")
  }
}

function relayPage(): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Noodle OAuth</title><p>Completing authorization…</p><script>const h=location.hash.slice(1);if(h){location.replace(location.pathname+"?"+h)}else{document.body.textContent="OAuth response did not include a URL fragment."}</script>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

function completePage(ok: boolean): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Noodle OAuth</title><p>${ok ? "Authorization complete. You can close this window." : "Authorization failed. Return to Noodle for details."}</p>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

export async function runLoopbackAuthorization(options: {
  authorizationUrl: string
  redirectUri: string
  state: string
  implicit: boolean
  signal?: AbortSignal
  openBrowser?: OAuthBrowserLauncher
  timeoutMs?: number
}): Promise<URLSearchParams> {
  if (browserFlowActive) {
    throw new Error("Another OAuth 2 browser authorization is already active")
  }
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  const redirect = validateLoopbackRedirect(options.redirectUri)
  browserFlowActive = true
  const timeoutMs = options.timeoutMs ?? 5 * 60_000
  let server: ReturnType<typeof Bun.serve> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const callback = new Promise<URLSearchParams>((resolve, reject) => {
      let settled = false
      const finish = (result: {
        params?: URLSearchParams
        error?: Error
      }): void => {
        if (settled) return
        settled = true
        if (result.error) reject(result.error)
        else resolve(result.params!)
      }

      server = Bun.serve({
        hostname: redirect.hostname === "[::1]" ? "::1" : redirect.hostname,
        port: Number(redirect.port),
        fetch(request) {
          const url = new URL(request.url)
          if (url.pathname !== redirect.pathname) {
            return new Response("Not found", { status: 404 })
          }
          if (options.implicit && url.search === "") return relayPage()
          const params = url.searchParams
          if (params.get("state") !== options.state) {
            finish({ error: new Error("OAuth 2 state validation failed") })
            return completePage(false)
          }
          if (params.has("error")) {
            finish({
              error: new Error(
                `OAuth 2 authorization failed: ${params.get("error")}`,
              ),
            })
            return completePage(false)
          }
          finish({ params: new URLSearchParams(params) })
          return completePage(true)
        },
      })

      timer = setTimeout(
        () => finish({ error: new Error("OAuth 2 authorization timed out") }),
        timeoutMs,
      )
      options.signal?.addEventListener(
        "abort",
        () => finish({ error: new DOMException("Aborted", "AbortError") }),
        { once: true },
      )
    })
    // A callback can fail while the injected/system browser launcher is still
    // running. Attach a handler immediately so runtimes do not report that
    // legitimate rejection as unhandled before we await it below.
    void callback.catch(() => {})

    // Bun.serve failures reject the callback promise from its executor. Do not
    // open a browser when there is no callback listener to receive the result.
    if (!server) return await callback
    const launch = (options.openBrowser ?? openSystemBrowser)(
      options.authorizationUrl,
    )
    return await Promise.race([callback, launch.then(() => callback)])
  } finally {
    if (timer) clearTimeout(timer)
    server?.stop()
    browserFlowActive = false
  }
}
