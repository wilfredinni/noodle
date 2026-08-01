const HTTP_SCHEME_RE = /^https?:\/\//i

export function withDefaultHttpsScheme(url: string): string {
  return HTTP_SCHEME_RE.test(url) ? url : `https://${url}`
}
