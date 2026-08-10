import type { Auth, FormEntry, KvEntry, ParamEntry, Request } from "../schema"

const CACHE_MAX = 100

function cacheSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.set(key, value)
  if (map.size > CACHE_MAX) {
    const first = map.keys().next().value as K | undefined
    if (first !== undefined) map.delete(first)
  }
}

function sortedEntries(rec: Record<string, KvEntry>): [string, KvEntry][] {
  return Object.entries(rec)
}

export function replaceRow(
  rec: Record<string, KvEntry>,
  index: number,
  key: string,
  value: string,
): Record<string, KvEntry> {
  const entries = sortedEntries(rec)
  if (!entries[index]) return rec
  const out: Record<string, KvEntry> = {}
  for (let i = 0; i < entries.length; i++) {
    const [k, entry] = entries[i]!
    if (i === index) {
      if (key !== "") out[key] = { value, enabled: entry.enabled }
    } else if (k !== key) {
      out[k] = entry
    }
  }
  return out
}

export function addRow(
  rec: Record<string, KvEntry>,
  key: string,
  value: string,
): Record<string, KvEntry> {
  if (key === "") return rec
  return { ...rec, [key]: { value, enabled: true } }
}

export function removeRow(
  rec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const entries = sortedEntries(rec)
  const target = entries[index]
  if (!target) return rec
  const out: Record<string, KvEntry> = {}
  for (const [k, v] of entries) if (k !== target[0]) out[k] = v
  return out
}

export function toggleRow(
  rec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const entries = sortedEntries(rec)
  const target = entries[index]
  if (!target) return rec
  const [k] = target
  const out: Record<string, KvEntry> = {}
  for (const [key, v] of entries) {
    if (key === k) {
      out[key] = { value: v.value, enabled: !v.enabled }
    } else {
      out[key] = v
    }
  }
  return out
}

export function revertRow(
  rec: Record<string, KvEntry>,
  originalRec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const origEntries = sortedEntries(originalRec)
  const curEntries = sortedEntries(rec)
  if (index >= origEntries.length) {
    return removeRow(rec, index)
  }
  const [origKey, origEntry] = origEntries[index]!
  const out: Record<string, KvEntry> = {}
  let placed = false
  for (let i = 0; i < curEntries.length; i++) {
    if (i === index) {
      out[origKey] = origEntry
      placed = true
    } else {
      const [k, v] = curEntries[i]!
      out[k] = v
    }
  }
  if (!placed) out[origKey] = origEntry
  return out
}

export function replaceParam(
  params: ParamEntry[],
  index: number,
  name: string,
  value: string,
): ParamEntry[] {
  const entry = params[index]
  if (!entry) return params
  if (name === "") return params.filter((_, i) => i !== index)
  return params.map((e, i) =>
    i === index ? { name, value, enabled: e.enabled } : e,
  )
}

export function addParam(
  params: ParamEntry[],
  name: string,
  value: string,
): ParamEntry[] {
  if (name === "") return params
  return [...params, { name, value, enabled: true }]
}

export function removeParam(params: ParamEntry[], index: number): ParamEntry[] {
  const entry = params[index]
  if (!entry) return params
  return params.filter((_, i) => i !== index)
}

export function revertParam(
  params: ParamEntry[],
  originalParams: ParamEntry[],
  index: number,
): ParamEntry[] {
  const origEntry = originalParams[index]
  if (!origEntry) {
    return removeParam(params, index)
  }
  const out = [...params]
  out[index] = { ...origEntry }
  return out
}

export function toggleParam(params: ParamEntry[], index: number): ParamEntry[] {
  const entry = params[index]
  if (!entry) return params
  return params.map((e, i) => (i === index ? { ...e, enabled: !e.enabled } : e))
}

export function recordsEqual(
  a: Record<string, KvEntry>,
  b: Record<string, KvEntry>,
): boolean {
  const ae = Object.entries(a).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  const be = Object.entries(b).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  if (ae.length !== be.length) return false
  for (let i = 0; i < ae.length; i++) {
    if (
      ae[i]![0] !== be[i]![0] ||
      ae[i]![1].value !== be[i]![1].value ||
      ae[i]![1].enabled !== be[i]![1].enabled
    )
      return false
  }
  return true
}

export function authEqual(
  a: Auth | undefined,
  b: Auth | undefined,
  opts?: { treatNoneAsEqual?: boolean },
): boolean {
  const treatNoneAsEqual = opts?.treatNoneAsEqual ?? false
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) {
    if (treatNoneAsEqual) {
      const defined = a ?? b
      return defined!.type === "none"
    }
    return false
  }
  if (a.type !== b.type) return false
  if (a.type === "none" && b.type === "none") return true
  if (a.type === "inherit" && b.type === "inherit") return true
  if (a.type === "bearer" && b.type === "bearer") return a.token === b.token
  if (a.type === "basic" && b.type === "basic") {
    return a.user === b.user && a.pass === b.pass
  }
  if (a.type === "api_key" && b.type === "api_key") {
    return a.key === b.key && a.value === b.value && a.placement === b.placement
  }
  return false
}

export function paramEntriesEqual(a: ParamEntry[], b: ParamEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i]!.name !== b[i]!.name ||
      a[i]!.value !== b[i]!.value ||
      a[i]!.enabled !== b[i]!.enabled
    )
      return false
  }
  return true
}

export function formEntriesEqual(a: FormEntry[], b: FormEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i]!.name !== b[i]!.name ||
      a[i]!.value !== b[i]!.value ||
      a[i]!.enabled !== b[i]!.enabled ||
      a[i]!.type !== b[i]!.type
    )
      return false
  }
  return true
}

export function requestEquals(a: Request, b: Request): boolean {
  if (a.url !== b.url) return false
  if (a.method !== b.method) return false
  if (a.timeout !== b.timeout) return false
  if (a.followRedirects !== b.followRedirects) return false
  if (a.maxRedirects !== b.maxRedirects) return false
  if (a.tls?.verify !== b.tls?.verify) return false
  if (a.body !== b.body) return false
  if ((a.bodyType ?? "json") !== (b.bodyType ?? "json")) return false
  if (a.filePath !== b.filePath) return false
  if (!recordsEqual(a.headers, b.headers)) return false
  if (!paramEntriesEqual(a.params, b.params)) return false
  if (!paramEntriesEqual(a.pathParams ?? [], b.pathParams ?? [])) return false
  if (!authEqual(a.auth, b.auth)) return false
  const fa = a.formData ?? []
  const fb = b.formData ?? []
  if (!formEntriesEqual(fa, fb)) return false
  return true
}

export function parseRow(input: string): { key: string; value: string } {
  const trimmed = input.trim()
  if (trimmed === "") return { key: "", value: "" }
  const colonIdx = trimmed.indexOf(":")
  if (colonIdx === -1) return { key: trimmed, value: "" }
  const key = trimmed.slice(0, colonIdx).trim()
  const value = trimmed.slice(colonIdx + 1).trim()
  return { key, value }
}

export function removeRequestDraftEntry<T>(
  map: Map<string, T>,
  id: string,
): Map<string, T> {
  if (!map.has(id)) return map
  const next = new Map(map)
  next.delete(id)
  return next
}

export function defaultAuth(authType: Auth["type"]): Auth {
  switch (authType) {
    case "none":
      return { type: "none" }
    case "inherit":
      return { type: "inherit" }
    case "bearer":
      return { type: "bearer", token: "" }
    case "basic":
      return { type: "basic", user: "", pass: "" }
    case "api_key":
      return { type: "api_key", key: "", value: "", placement: "header" }
    default:
      return { type: "none" }
  }
}

export { cacheSet, sortedEntries, CACHE_MAX }
