const VAR_RE = /\$(\w+)/g

const VAR_PREFIX = "noodle-var-"
const SCHEME_SENTINEL = "http://noodle-sentinel.invalid/"

export interface VarHasher {
  hashed: string
  restore: (input: string) => string
}

export function hashVars(url: string): VarHasher {
  let hadScheme = true
  let working = url

  if (!working.startsWith("http://") && !working.startsWith("https://")) {
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
    if (!hadScheme) {
      s = s.replaceAll(SCHEME_SENTINEL, "")
    }
    return s
  }

  return { hashed, restore }
}
