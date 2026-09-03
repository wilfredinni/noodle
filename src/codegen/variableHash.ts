const VAR_RE = /\$(\w+)/g
const HOSTLESS_SCHEME_RE = /^(https?:\/\/)(?=[:/?#]|$)/

const VAR_PREFIX = "noodle-var-"
const HOST_SENTINEL = "noodle-sentinel.invalid/"
const SCHEME_SENTINEL = `http://${HOST_SENTINEL}`

export interface VarHasher {
  hashed: string
  restore: (input: string) => string
}

export function hashVars(url: string): VarHasher {
  let hadScheme = true
  let working = url
  const hostlessScheme = working.match(HOSTLESS_SCHEME_RE)?.[1]

  if (hostlessScheme) {
    working = `${hostlessScheme}${HOST_SENTINEL}${working.slice(hostlessScheme.length)}`
  } else if (
    !working.startsWith("http://") &&
    !working.startsWith("https://")
  ) {
    working = SCHEME_SENTINEL + working
    hadScheme = false
  }

  let counter = 0
  const map = new Map<number, string>()
  const hashed = working.replace(VAR_RE, (match) => {
    const id = counter++
    const placeholder = `${VAR_PREFIX}${id}`
    map.set(id, match)
    return placeholder
  })

  const restore = (input: string): string => {
    let s = input
    for (let i = counter - 1; i >= 0; i--) {
      const original = map.get(i)
      if (original !== undefined) {
        s = s.replaceAll(`${VAR_PREFIX}${i}`, original)
      }
    }
    if (hostlessScheme) {
      s = s.replaceAll(`${hostlessScheme}${HOST_SENTINEL}`, hostlessScheme)
    } else if (!hadScheme) {
      s = s.replaceAll(SCHEME_SENTINEL, "")
    }
    return s
  }

  return { hashed, restore }
}
