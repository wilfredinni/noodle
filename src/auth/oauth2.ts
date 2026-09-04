const OIDC_DISCOVERY_PATH = "/.well-known/openid-configuration"

export function oauth2DiscoveryUrlForIssuer(url: URL): URL {
  const discoveryUrl = new URL(url)
  const path = discoveryUrl.pathname.replace(/\/+$/, "")
  discoveryUrl.pathname = `${path}${OIDC_DISCOVERY_PATH}`
  return discoveryUrl
}

export function normalizeOAuth2DiscoveryUrl(url: URL): URL {
  const normalized = new URL(url)
  const path = normalized.pathname.replace(/\/+$/, "")
  if (!path.endsWith(OIDC_DISCOVERY_PATH)) {
    return oauth2DiscoveryUrlForIssuer(normalized)
  }
  normalized.pathname = path
  return normalized
}
