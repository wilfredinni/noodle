import type { Response } from "./schema"

export function responseContentType(headers: Record<string, string>): string {
  const mime =
    Object.entries(headers)
      .find(([name]) => name.toLowerCase() === "content-type")?.[1]
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase() || ""
  return /^[a-z0-9!#$%&'*+.^_`|~-]+\/[a-z0-9!#$%&'*+.^_`|~-]+$/.test(mime)
    ? mime
    : "application/octet-stream"
}

export function classifyResponseBody(
  bytes: Uint8Array,
  headers: Record<string, string>,
): "text" | "binary" {
  const hasType = Object.keys(headers).some(
    (name) => name.toLowerCase() === "content-type",
  )
  const mime = responseContentType(headers)
  if (hasType) {
    return mime.startsWith("text/") ||
      /\/(?:json|xml|javascript|ecmascript|x-javascript|x-www-form-urlencoded|graphql|x-ndjson|ndjson)$/.test(
        mime,
      ) ||
      /\+(?:json|xml)$/.test(mime)
      ? "text"
      : "binary"
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    // eslint-disable-next-line no-control-regex
    return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)
      ? "binary"
      : "text"
  } catch {
    return "binary"
  }
}

export function responseByteSize(
  response: Pick<Response, "body" | "bodyBytes">,
): number {
  return (
    response.bodyBytes?.byteLength ?? Buffer.byteLength(response.body, "utf8")
  )
}

export function responseText(
  response: Pick<Response, "body" | "bodyKind" | "bodyBytes">,
): string {
  return response.bodyKind === "binary"
    ? new TextDecoder().decode(response.bodyBytes)
    : response.body
}

export function responseImageFormat(
  bytes: Uint8Array,
): "png" | "jpeg" | "webp" | "gif" | null {
  const starts = (...prefix: number[]) =>
    prefix.every((value, index) => bytes[index] === value)
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "png"
  if (starts(255, 216, 255)) return "jpeg"
  if (
    starts(71, 73, 70, 56) &&
    (bytes[4] === 55 || bytes[4] === 57) &&
    bytes[5] === 97
  )
    return "gif"
  if (
    starts(82, 73, 70, 70) &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80
  )
    return "webp"
  return null
}

function safeFilename(value: string): string | undefined {
  // Server names are suggestions, never paths or terminal control sequences.
  const name = value
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, "")
    .replace(/[. ]+$/, "")
    .trim()
  if (
    !name ||
    name === "." ||
    name === ".." ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    return undefined
  let bounded = ""
  for (const character of name) {
    if (Buffer.byteLength(bounded + character, "utf8") > 180) break
    bounded += character
  }
  return bounded.replace(/[. ]+$/, "") || undefined
}

export function responseFilename(
  headers: Record<string, string>,
): string | undefined {
  const disposition = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "content-disposition",
  )?.[1]
  if (!disposition) return undefined
  const encoded = /(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(
    disposition,
  )
  const extended = encoded?.[1] ?? encoded?.[2]?.trim()
  if (extended) {
    const match = /^utf-8'[^']*'(.*)$/i.exec(extended)
    if (match) {
      try {
        const name = safeFilename(decodeURIComponent(match[1]!))
        if (name) return name
      } catch {
        // Fall back to the ordinary filename when encoding is invalid.
      }
    }
  }
  const ordinary =
    /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i.exec(
      disposition,
    )
  const value =
    ordinary?.[1]?.replace(/\\(["\\])/g, "$1") ?? ordinary?.[2]?.trim()
  return value ? safeFilename(value) : undefined
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/gzip": "gz",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/plain": "txt",
  "text/html": "html",
  "text/csv": "csv",
  "image/svg+xml": "svg",
}

export function suggestedResponseFilename(
  response: Pick<Response, "headers" | "bodyBytes">,
  requestName: string,
): string {
  const supplied = responseFilename(response.headers)
  if (supplied) return supplied
  const image = response.bodyBytes
    ? responseImageFormat(response.bodyBytes)
    : null
  const extension =
    image === "jpeg"
      ? "jpg"
      : (image ?? EXTENSIONS[responseContentType(response.headers)] ?? "bin")
  return `${safeFilename(requestName) ?? "response"}.${extension}`
}
