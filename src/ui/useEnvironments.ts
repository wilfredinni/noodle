import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Environment } from "../schema"
import { env } from "../env"
import { envIndicatorLabel } from "./envIndicator"

export interface UseEnvironmentsResult {
  names: string[]
  activeIndex: number
  activeEnv: Environment | null
  error: Error | null
  indicatorLabel: string
  cycle: (delta: number) => void
}

export function useEnvironments(
  dir: string,
  envList: string[],
  initialName?: string,
  lastEnv?: string | null,
  onEnvChange?: (name: string | null) => void,
): UseEnvironmentsResult {
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (initialName !== undefined) return envList.indexOf(initialName)
    if (lastEnv !== undefined && lastEnv !== null) return envList.indexOf(lastEnv)
    return -1
  })
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const genRef = useRef(0)

  // mount-only — deps intentionally omitted (stable for App's lifetime)
  useEffect(() => {
    const target = initialName ?? lastEnv ?? undefined
    if (target === undefined) return
    if (!envList.includes(target)) return
    let cancelled = false
    env
      .loadEnvironment(dir, target)
      .then((loaded) => {
        if (cancelled) return
        setActiveEnv(loaded)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setActiveEnv(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cycle = useCallback(
    (delta: number) => {
      if (envList.length === 0) return
      let candidate = activeIndex < 0 ? 0 : activeIndex + delta
      if (candidate >= envList.length) candidate = 0
      if (candidate < 0) candidate = envList.length - 1
      const name = envList[candidate]
      genRef.current += 1
      const gen = genRef.current
      setError(null)
      setActiveIndex(candidate)
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
    [dir, envList, activeIndex, onEnvChange],
  )

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
    cycle,
  }
}
