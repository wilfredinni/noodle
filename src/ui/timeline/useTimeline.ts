import { useCallback, useEffect, useRef, useState } from "react"
import type { TimelineEntry } from "../../schema"
import { loadTimeline, saveTimelineEntry } from "../../filestore"

export interface UseTimelineResult {
  entries: TimelineEntry[]
  loading: boolean
  appendEntry: (entry: TimelineEntry) => Promise<void>
  reload: () => Promise<void>
}

export function useTimeline(
  collectionDir: string | undefined,
  requestId: string | undefined,
  maxEntries = 50,
): UseTimelineResult {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const lastKeyRef = useRef("")
  const mountedRef = useRef(true)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const doLoad = useCallback(async () => {
    if (!collectionDir || !requestId) {
      setEntries([])
      return
    }
    setLoading(true)
    try {
      const loaded = await loadTimeline(collectionDir, requestId)
      if (mountedRef.current) {
        setEntries(loaded)
      }
    } catch {
      if (mountedRef.current) setEntries([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [collectionDir, requestId])

  useEffect(() => {
    const key = `${collectionDir ?? ""}||${requestId ?? ""}`
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key
      doLoad()
    }
  }, [collectionDir, requestId, doLoad])

  const appendEntry = useCallback(
    async (entry: TimelineEntry) => {
      if (!collectionDir || !requestId) return
      const save = saveChainRef.current.then(() =>
        saveTimelineEntry(collectionDir, requestId, entry, maxEntries),
      )
      saveChainRef.current = save.catch(() => {})
      await save
      setEntries((prev) => {
        const next = [entry, ...prev]
        return next.length > maxEntries ? next.slice(0, maxEntries) : next
      })
    },
    [collectionDir, requestId, maxEntries],
  )

  return { entries, loading, appendEntry, reload: doLoad }
}
