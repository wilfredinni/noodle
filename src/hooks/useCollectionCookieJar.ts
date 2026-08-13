import { useCallback, useEffect, useState } from "react"
import {
  CollectionCookieJar,
  CookieJarStorageError,
  type CookieJarStatus,
} from "../cookies"
import { ensureCollectionId } from "../secrets"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export interface CollectionCookieJarState {
  jar: CollectionCookieJar | null
  status: CookieJarStatus
  flush: () => Promise<void>
  retry: () => Promise<void>
  reset: () => Promise<{ backupPath?: string }>
}

export function useCollectionCookieJar(
  collectionDir: string | undefined,
  configDir = CONFIG_DIR,
): CollectionCookieJarState {
  const [jar, setJar] = useState<CollectionCookieJar | null>(null)
  const [status, setStatus] = useState<CookieJarStatus>(
    collectionDir ? { state: "loading" } : { state: "disabled" },
  )
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    let handle: CollectionCookieJar | null = null
    let unsubscribe: (() => void) | undefined
    setJar(null)
    setStatus(collectionDir ? { state: "loading" } : { state: "disabled" })
    if (!collectionDir) return
    void (async () => {
      try {
        const collectionId = await ensureCollectionId(collectionDir)
        handle = await CollectionCookieJar.open(configDir, collectionId)
        if (cancelled) {
          await handle.close().catch(() => {})
          return
        }
        setJar(handle)
        setStatus(handle.status)
        unsubscribe = handle.subscribe(() => setStatus(handle!.status))
      } catch (error) {
        if (cancelled) return
        setStatus({
          state: "unavailable",
          error: new CookieJarStorageError(
            "read",
            "Cookie storage could not be initialized.",
            collectionDir,
            { cause: error },
          ),
        })
      }
    })()
    return () => {
      cancelled = true
      unsubscribe?.()
      void handle?.close().catch((error) => {
        process.stderr.write(
          `warning: failed to flush cookie storage: ${error instanceof Error ? error.message : String(error)}\n`,
        )
      })
    }
  }, [collectionDir, configDir, retryToken])

  const flush = useCallback(async () => {
    if (!jar) return
    await jar.saveNow()
    setStatus(jar.status)
  }, [jar])

  const retry = useCallback(async () => {
    if (!collectionDir) return
    const collectionId = await ensureCollectionId(collectionDir)
    const probe = await CollectionCookieJar.open(configDir, collectionId)
    try {
      if (probe.status.state === "unavailable") throw probe.status.error
    } finally {
      await probe.close()
    }
    setRetryToken((current) => current + 1)
  }, [collectionDir, configDir])

  const reset = useCallback(async () => {
    let recoveryJar = jar
    if (!recoveryJar) {
      if (!collectionDir) return {}
      const collectionId = await ensureCollectionId(collectionDir)
      recoveryJar = await CollectionCookieJar.open(configDir, collectionId)
    }
    const temporary = recoveryJar !== jar
    try {
      const result = await recoveryJar.reset()
      setStatus(recoveryJar.status)
      return result
    } finally {
      if (temporary) {
        await recoveryJar.close()
        setRetryToken((current) => current + 1)
      }
    }
  }, [collectionDir, configDir, jar])

  return { jar, status, flush, retry, reset }
}
