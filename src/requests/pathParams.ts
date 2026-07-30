export const PATH_PARAM_NAME = String.raw`\w[\w-]*`

export const PATH_TOKEN_RE = new RegExp(`^:(${PATH_PARAM_NAME})(?=\\.|$)`)
export const URL_PATH_TOKEN_RE = new RegExp(
  `(?:^|/):(${PATH_PARAM_NAME})(?=\\.|/|$)`,
  "g",
)
const OPENAPI_PATH_TOKEN_RE = new RegExp(`\\{(${PATH_PARAM_NAME})\\}`, "g")

export function parsePathToken(segment: string): string | null {
  return segment.match(PATH_TOKEN_RE)?.[1] ?? null
}

export function parseOpenApiPathTokens(template: string): string[] {
  OPENAPI_PATH_TOKEN_RE.lastIndex = 0
  return Array.from(template.matchAll(OPENAPI_PATH_TOKEN_RE), (m) => m[1]!)
}

export function openApiPathTemplateToColon(template: string): string {
  return template.replace(OPENAPI_PATH_TOKEN_RE, ":$1")
}
