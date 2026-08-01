import { isIP } from "node:net"

const EXPLICIT_SCHEME_RE = /^([a-z][a-z\d+.-]*):\/\//i

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    (isIP(host) === 4 && host.startsWith("127."))
  )
}

export function withDefaultHttpsScheme(url: string): string {
  const scheme = url.match(EXPLICIT_SCHEME_RE)?.[1]?.toLowerCase()
  if (scheme) {
    if (scheme === "http" || scheme === "https") return url
    throw new Error(`requests.url: unsupported URL scheme "${scheme}:"`)
  }

  try {
    if (isLoopbackHost(new URL(`http://${url}`).hostname)) {
      return `http://${url}`
    }
  } catch {
    // Let the creation or send boundary report the invalid URL.
  }
  return `https://${url}`
}
