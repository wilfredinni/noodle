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
  reset: () => Promise<{ backupPath?: string }>
}

export function useCollectionCookieJar(
  collectionDir: string | undefined,
): CollectionCookieJarState {
  const [jar, setJar] = useState<CollectionCookieJar | null>(null)
  const [status, setStatus] = useState<CookieJarStatus>(
    collectionDir ? { state: "loading" } : { state: "disabled" },
  )

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
        handle = await CollectionCookieJar.open(CONFIG_DIR, collectionId)
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
  }, [collectionDir])

  const flush = useCallback(async () => {
    if (!jar) return
    await jar.saveNow()
    setStatus(jar.status)
  }, [jar])

  const reset = useCallback(async () => {
    if (!jar) return {}
    const result = await jar.reset()
    setStatus(jar.status)
    return result
  }, [jar])

  return { jar, status, flush, reset }
}
