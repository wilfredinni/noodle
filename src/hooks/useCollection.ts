import { useEffect, useState } from "react"
import { filestore } from "../filestore"
import type { Collection } from "../schema"

export interface UseCollectionResult {
  collection: Collection | null
  loading: boolean
  error: Error | null
  updateCollection: (collection: Collection) => void
}

export function useCollection(
  dir: string,
  reloadToken = 0,
): UseCollectionResult {
  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    let cancelled = false

    filestore
      .loadCollection(dir)
      .then((c) => {
        if (!cancelled) {
          setCollection(c)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [dir, reloadToken])

  return { collection, loading, error, updateCollection: setCollection }
}
