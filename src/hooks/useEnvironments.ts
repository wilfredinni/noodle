import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Environment } from "../schema"
import { env } from "../env"
import { envIndicator, type EnvStatus } from "../ui/envIndicator"

export interface UseEnvironmentsResult {
  names: string[]
  activeName: string | null
  activeIndex: number
  activeEnv: Environment | null
  error: Error | null
  indicatorLabel: string
  status: EnvStatus
  select: (name: string) => void
  cycle: (delta: number) => void
  reloadActiveEnv: () => Promise<void>
}

export function useEnvironments(
  dir: string,
  envList: string[],
  initialName?: string,
  settingsEnv?: string,
  onEnvChange?: (name: string | null) => void,
): UseEnvironmentsResult {
  const [activeName, setActiveName] = useState<string | null>(() => {
    // Priority: CLI --env > settings.yml environment > first env in list
    if (initialName !== undefined)
      return envList.includes(initialName) ? initialName : null
    if (settingsEnv !== undefined && envList.includes(settingsEnv))
      return settingsEnv
    return envList[0] ?? null
  })
  const activeIndex = activeName === null ? -1 : envList.indexOf(activeName)
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const genRef = useRef(0)
  const activeNameRef = useRef(activeName)
  useEffect(() => {
    activeNameRef.current = activeName
  }, [activeName])

  // mount-only — deps intentionally omitted (stable for App's lifetime)
  useEffect(() => {
    const target = activeName
    if (target === null) return
    let cancelled = false
    genRef.current += 1
    const gen = genRef.current
    env
      .loadEnvironment(dir, target)
      .then((loaded) => {
        if (cancelled || gen !== genRef.current) return
        setActiveEnv(loaded)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled || gen !== genRef.current) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setActiveEnv(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const select = useCallback(
    (name: string) => {
      if (!envList.includes(name)) return
      activeNameRef.current = name
      genRef.current += 1
      const gen = genRef.current
      setError(null)
      setActiveName(name)
      setActiveEnv(null)
      env
        .loadEnvironment(dir, name)
        .then((loaded) => {
          if (gen !== genRef.current) return
          setActiveEnv(loaded)
          setError(null)
          onEnvChange?.(name)
        })
        .catch((e: unknown) => {
          if (gen !== genRef.current) return
          const err = e instanceof Error ? e : new Error(String(e))
          setError(err)
          setActiveEnv(null)
        })
    },
    [dir, envList, onEnvChange],
  )

  useEffect(() => {
    if (activeName !== null && envList.includes(activeName)) return
    const fallback = envList[0]
    if (fallback !== undefined) {
      select(fallback)
    } else if (activeName !== null) {
      activeNameRef.current = null
      genRef.current += 1
      setActiveName(null)
      setActiveEnv(null)
      setError(null)
      onEnvChange?.(null)
    }
  }, [activeName, envList, onEnvChange, select])

  const cycle = useCallback(
    (delta: number) => {
      if (envList.length === 0) return
      const candidate =
        activeIndex < 0
          ? 0
          : (((activeIndex + delta) % envList.length) + envList.length) %
            envList.length
      select(envList[candidate]!)
    },
    [envList, activeIndex, select],
  )

  const reloadActiveEnv = useCallback(async () => {
    if (
      activeName === null ||
      activeNameRef.current !== activeName ||
      !envList.includes(activeName)
    )
      return
    genRef.current += 1
    const gen = genRef.current
    try {
      const loaded = await env.loadEnvironment(dir, activeName)
      if (gen !== genRef.current || activeNameRef.current !== activeName) return
      setActiveEnv(loaded)
      setError(null)
    } catch (e: unknown) {
      if (gen !== genRef.current || activeNameRef.current !== activeName) return
      const err = e instanceof Error ? e : new Error(String(e))
      setError(err)
      setActiveEnv(null)
    }
  }, [dir, envList, activeName])

  const indicator = useMemo(
    () => envIndicator(envList, activeIndex, activeEnv, error),
    [envList, activeIndex, activeEnv, error],
  )

  return {
    names: envList,
    activeName,
    activeIndex,
    activeEnv,
    error,
    indicatorLabel: indicator.label,
    status: indicator.status,
    select,
    cycle,
    reloadActiveEnv,
  }
}
