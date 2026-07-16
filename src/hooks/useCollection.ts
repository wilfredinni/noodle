import { useEffect, useState } from "react"
import { filestore } from "../filestore"
import { loadCollectionBrowse } from "../filestore"
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
  skip = false,
  browse = false,
): UseCollectionResult {
  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (skip) {
      setCollection(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false

    const loader = browse ? loadCollectionBrowse : filestore.loadCollection

    loader(dir)
      .then((c) => {
        if (!cancelled) {
          setCollection(c)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          if (browse) {
            setCollection({ id: dir, name: dir, items: [] })
          }
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [dir, reloadToken, skip, browse])

  return { collection, loading, error, updateCollection: setCollection }
}
