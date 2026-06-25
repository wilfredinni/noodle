import { useCallback, useEffect, useMemo, useState } from "react"
import type { Environment } from "../schema"
import { env } from "../env"
import { nextIndex } from "./selection"
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
): UseEnvironmentsResult {
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    initialName !== undefined ? envList.indexOf(initialName) : -1,
  )
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (initialName === undefined) return
    const idx = envList.indexOf(initialName)
    if (idx < 0) return
    let cancelled = false
    env
      .loadEnvironment(dir, initialName)
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
      const prevIndex = activeIndex
      const candidate = nextIndex(
        prevIndex < 0 ? -1 : prevIndex,
        envList.length,
        delta,
      )
      const target = candidate < 0 ? 0 : candidate
      const name = envList[target]
      setError(null)
      setActiveIndex(target)
      env
        .loadEnvironment(dir, name)
        .then((loaded) => {
          setActiveEnv(loaded)
          setError(null)
        })
        .catch((e: unknown) => {
          const err = e instanceof Error ? e : new Error(String(e))
          setError(err)
          setActiveEnv(null)
          if (activeEnv !== null) {
            setActiveIndex(prevIndex < 0 ? -1 : prevIndex)
          }
        })
    },
    [dir, envList, activeIndex, activeEnv],
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
