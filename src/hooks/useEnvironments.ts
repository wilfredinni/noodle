import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Environment } from "../schema"
import { env } from "../env"
import { envIndicatorLabel } from "../ui/envIndicator"

export interface UseEnvironmentsResult {
  names: string[]
  activeIndex: number
  activeEnv: Environment | null
  error: Error | null
  indicatorLabel: string
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
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    // Priority: CLI --env > settings.yml environment > first env in list
    if (initialName !== undefined) return envList.indexOf(initialName)
    if (settingsEnv !== undefined && envList.includes(settingsEnv))
      return envList.indexOf(settingsEnv)
    if (envList.length > 0) return 0
    return -1
  })
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const genRef = useRef(0)

  // mount-only — deps intentionally omitted (stable for App's lifetime)
  useEffect(() => {
    const target =
      initialName !== undefined
        ? envList.includes(initialName)
          ? initialName
          : undefined
        : settingsEnv !== undefined && envList.includes(settingsEnv)
          ? settingsEnv
          : envList.length > 0
            ? envList[0]
            : undefined
    if (target === undefined) return
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
      const index = envList.indexOf(name)
      if (index < 0) return
      genRef.current += 1
      const gen = genRef.current
      setError(null)
      setActiveIndex(index)
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

  const cycle = useCallback(
    (delta: number) => {
      if (envList.length === 0) return
      let candidate = activeIndex < 0 ? 0 : activeIndex + delta
      if (candidate >= envList.length) candidate = 0
      if (candidate < 0) candidate = envList.length - 1
      select(envList[candidate]!)
    },
    [envList, activeIndex, select],
  )

  const reloadActiveEnv = useCallback(async () => {
    if (activeIndex < 0 || !envList[activeIndex]) return
    genRef.current += 1
    const gen = genRef.current
    const name = envList[activeIndex]
    try {
      const loaded = await env.loadEnvironment(dir, name)
      if (gen !== genRef.current) return
      setActiveEnv(loaded)
      setError(null)
    } catch (e: unknown) {
      if (gen !== genRef.current) return
      const err = e instanceof Error ? e : new Error(String(e))
      setError(err)
      setActiveEnv(null)
    }
  }, [dir, envList, activeIndex])

  const indicatorLabel = useMemo(
    () => envIndicatorLabel(envList, activeIndex, activeEnv, error),
    [envList, activeIndex, activeEnv, error],
  )

  return {
    names: envList,
    activeIndex,
    activeEnv,
    error,
    indicatorLabel,
    select,
    cycle,
    reloadActiveEnv,
  }
}
