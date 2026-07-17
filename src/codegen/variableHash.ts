const VAR_RE = /\$(\w+)/g

function djb2(s: string): number {
  let hash = 5381
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i)
  }
  return hash >>> 0
}

const HASH_PREFIX = "noodle-var-hash-"

export interface VarHasher {
  hashed: string
  restore: (input: string) => string
}

/**
 * Replace `$VARNAME` tokens in a URL with deterministic URL-safe hashes
 * so URL parsing/encoding leaves them intact. When the URL lacks an
 * explicit scheme (e.g. `$base_url/photos`), a temporary `http://` scheme
 * is injected so downstream HAR validators accept the URL — and stripped
 * again by `restore` after snippet generation.
 */
export function hashVars(url: string): VarHasher {
  let hadScheme = true
  let working = url

  if (!working.startsWith("http://") && !working.startsWith("https://")) {
    working = "http://" + working
    hadScheme = false
  }

  const map = new Map<string, string>()
  const hashed = working.replace(VAR_RE, (match) => {
    const hash = `${HASH_PREFIX}${djb2(match)}`
    map.set(hash, match)
    return hash
  })

  const restore = (input: string): string => {
    let s = input
    for (const [hash, original] of map) {
      s = s.replaceAll(hash, original)
    }
    if (!hadScheme) {
      s = s.replace(/^https?:\/\//, "")
    }
    return s
  }

  return { hashed, restore }
}
