import { useCallback, useEffect, useRef, useState } from "react"
import type { TimelineEntry } from "../../schema"
import {
  DEFAULT_TIMELINE_MAX_ENTRIES,
  loadTimeline,
  saveTimelineEntry,
} from "../../filestore"

export interface UseTimelineResult {
  entries: TimelineEntry[]
  loading: boolean
  appendEntry: (entry: TimelineEntry) => Promise<void>
  reload: () => Promise<void>
}

export function useTimeline(
  collectionDir: string | undefined,
  requestId: string | undefined,
  maxEntries = DEFAULT_TIMELINE_MAX_ENTRIES,
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
        setEntries(loaded.slice(0, maxEntries))
      }
    } catch {
      if (mountedRef.current) setEntries([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [collectionDir, requestId, maxEntries])

  useEffect(() => {
    const key = `${collectionDir ?? ""}||${requestId ?? ""}||${maxEntries}`
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key
      doLoad()
    }
  }, [collectionDir, requestId, maxEntries, doLoad])

  const appendEntry = useCallback(
    async (entry: TimelineEntry) => {
      if (!collectionDir || !requestId) return
      if (maxEntries === 0) return
      const save = saveChainRef.current.then(() =>
        saveTimelineEntry(collectionDir, requestId, entry, maxEntries),
      )
      saveChainRef.current = save.then(() => {}).catch(() => {})
      const persisted = await save
      setEntries((prev) => {
        const next = [persisted, ...prev]
        return next.length > maxEntries ? next.slice(0, maxEntries) : next
      })
    },
    [collectionDir, requestId, maxEntries],
  )

  return { entries, loading, appendEntry, reload: doLoad }
}
