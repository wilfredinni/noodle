import { useCallback, useEffect, useMemo, useState } from "react"
import type { CollectionCookieJar, JarCookie } from "../cookies"

export interface CookieDomainGroup {
  domain: string
  count: number
}

export interface UseCookieJarViewResult {
  jar: CollectionCookieJar | null
  domains: CookieDomainGroup[]
  cookies: JarCookie[]
  selectedDomain: string | null
  domainIndex: number
  cookieIndex: number
  filter: string
  filtering: boolean
  refresh: () => void
  selectDomain: (domain: string) => void
  domainUp: () => void
  domainDown: () => void
  cookieUp: () => void
  cookieDown: () => void
  selectCookie: (index: number) => void
  setFilter: (value: string) => void
  setFiltering: (value: boolean) => void
  deleteSelectedCookie: () => void
  deleteSelectedDomain: () => void
  clearAll: () => void
}

function groupByDomain(cookies: JarCookie[]): CookieDomainGroup[] {
  const counts = new Map<string, number>()
  for (const cookie of cookies) {
    counts.set(cookie.domain, (counts.get(cookie.domain) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([domain, count]) => ({ domain, count }))
}

function matchesFilter(cookie: JarCookie, filter: string): boolean {
  const needle = filter.toLowerCase()
  return (
    cookie.name.toLowerCase().includes(needle) ||
    cookie.value.toLowerCase().includes(needle) ||
    cookie.path.toLowerCase().includes(needle)
  )
}

export function useCookieJarView(
  jar: CollectionCookieJar | null,
): UseCookieJarViewResult {
  const [version, setVersion] = useState(0)
  const [domainIndex, setDomainIndex] = useState(0)
  const [cookieIndex, setCookieIndex] = useState(0)
  const [filter, setFilter] = useState("")
  const [filtering, setFiltering] = useState(false)

  const allCookies = useMemo(() => (jar ? jar.list() : []), [jar, version])
  const domains = useMemo(() => groupByDomain(allCookies), [allCookies])
  const selectedDomain = domains[domainIndex]?.domain ?? null
  const cookies = useMemo(() => {
    if (!selectedDomain) return []
    const domainCookies = allCookies.filter(
      (cookie) => cookie.domain === selectedDomain,
    )
    const needle = filter.trim()
    return needle
      ? domainCookies.filter((cookie) => matchesFilter(cookie, needle))
      : domainCookies
  }, [allCookies, selectedDomain, filter])

  useEffect(() => {
    setDomainIndex((index) => Math.min(index, Math.max(domains.length - 1, 0)))
  }, [domains.length])
  useEffect(() => {
    setCookieIndex((index) => Math.min(index, Math.max(cookies.length - 1, 0)))
  }, [cookies.length])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const selectDomain = useCallback(
    (domain: string) => {
      setDomainIndex((index) => {
        const next = domains.findIndex((group) => group.domain === domain)
        return next >= 0 ? next : index
      })
      setCookieIndex(0)
      setFilter("")
      setFiltering(false)
    },
    [domains],
  )
  const domainUp = useCallback(() => {
    setDomainIndex((index) =>
      domains.length === 0 ? 0 : (index - 1 + domains.length) % domains.length,
    )
    setCookieIndex(0)
  }, [domains.length])
  const domainDown = useCallback(() => {
    setDomainIndex((index) =>
      domains.length === 0 ? 0 : (index + 1) % domains.length,
    )
    setCookieIndex(0)
  }, [domains.length])
  const cookieUp = useCallback(
    () =>
      setCookieIndex((index) =>
        cookies.length === 0
          ? 0
          : (index - 1 + cookies.length) % cookies.length,
      ),
    [cookies.length],
  )
  const cookieDown = useCallback(
    () =>
      setCookieIndex((index) =>
        cookies.length === 0 ? 0 : (index + 1) % cookies.length,
      ),
    [cookies.length],
  )
  const selectCookie = useCallback(
    (index: number) =>
      setCookieIndex((prev) =>
        index >= 0 && index < cookies.length ? index : prev,
      ),
    [cookies.length],
  )

  const deleteSelectedCookie = useCallback(() => {
    if (!jar) return
    const cookie = cookies[cookieIndex]
    if (!cookie) return
    void jar
      .deleteCookie(cookie.domain, cookie.path, cookie.name)
      .then(refresh)
      .catch(() => {})
  }, [jar, cookies, cookieIndex, refresh])

  const deleteSelectedDomain = useCallback(() => {
    if (!jar || !selectedDomain) return
    void jar
      .deleteDomain(selectedDomain)
      .then(refresh)
      .catch(() => {})
  }, [jar, selectedDomain, refresh])

  const clearAll = useCallback(() => {
    if (!jar) return
    void jar
      .clear()
      .then(refresh)
      .catch(() => {})
  }, [jar, refresh])

  return {
    jar,
    domains,
    cookies,
    selectedDomain,
    domainIndex,
    cookieIndex,
    filter,
    filtering,
    refresh,
    selectDomain,
    domainUp,
    domainDown,
    cookieUp,
    cookieDown,
    selectCookie,
    setFilter,
    setFiltering,
    deleteSelectedCookie,
    deleteSelectedDomain,
    clearAll,
  }
}
