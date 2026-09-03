import { randomUUID } from "node:crypto"

const VAR_RE = /\$(\w+)/g
const HTTP_AUTHORITY_RE = /^https?:\/\/([^/?#]*)/

const VAR_PREFIX = "noodle-var-"

export interface VarHasher {
  hashed: string
  restore: (input: string) => string
}

export function hashVars(url: string): VarHasher {
  const schemeSentinel = `http://noodle-sentinel-${randomUUID()}.invalid/`
  let working = url
  let addedSentinel = false

  if (!working.startsWith("http://") && !working.startsWith("https://")) {
    working = schemeSentinel + working
    addedSentinel = true
  }

  let counter = 0
  const map = new Map<number, string>()
  let hashed = working.replace(VAR_RE, (match) => {
    const id = counter++
    const placeholder = `${VAR_PREFIX}${id}`
    map.set(id, match)
    return placeholder
  })
  const authority = hashed.match(HTTP_AUTHORITY_RE)?.[1] ?? ""
  const host = authority.slice(authority.lastIndexOf("@") + 1)
  if (!host || host.startsWith(":") || !URL.canParse(hashed)) {
    hashed = schemeSentinel + hashed
    addedSentinel = true
  }

  const restore = (input: string): string => {
    let s = input
    for (let i = counter - 1; i >= 0; i--) {
      const original = map.get(i)
      if (original !== undefined) {
        s = s.replaceAll(`${VAR_PREFIX}${i}`, original)
      }
    }
    if (addedSentinel) {
      s = s.replace(schemeSentinel, "")
    }
    return s
  }

  return { hashed, restore }
}
