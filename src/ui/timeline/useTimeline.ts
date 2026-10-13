import { useCallback, useEffect, useRef, useState } from "react"
import type { TimelineEntry } from "../../schema"
import {
  DEFAULT_TIMELINE_MAX_ENTRIES,
  loadTimeline,
  loadTimelineBody,
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
  hydrateLatestResponseBody = false,
): UseTimelineResult {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const lastKeyRef = useRef("")
  const loadGenerationRef = useRef(0)
  const mountedRef = useRef(true)
  const appendedDuringLoadRef = useRef<TimelineEntry[] | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const doLoad = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    if (!collectionDir || !requestId) {
      setEntries([])
      setLoading(false)
      return
    }
    const appended: TimelineEntry[] = []
    appendedDuringLoadRef.current = appended
    setLoading(true)
    try {
      const loaded = await loadTimeline(collectionDir, requestId)
      if (mountedRef.current && generation === loadGenerationRef.current) {
        const savedIds = new Set(appended.map((entry) => entry.id))
        setEntries(
          [
            ...appended,
            ...loaded.filter((entry) => !entry.id || !savedIds.has(entry.id)),
          ].slice(0, maxEntries),
        )
      }
    } catch {
      // Selection changes clear entries; a failed refresh keeps the visible history.
    } finally {
      if (mountedRef.current && generation === loadGenerationRef.current) {
        appendedDuringLoadRef.current = null
        setLoading(false)
      }
    }
  }, [collectionDir, requestId, maxEntries])

  useEffect(() => {
    const key = `${collectionDir ?? ""}||${requestId ?? ""}||${maxEntries}`
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key
      setEntries([])
      doLoad()
    }
  }, [collectionDir, requestId, maxEntries, doLoad])

  useEffect(() => {
    if (!hydrateLatestResponseBody || !collectionDir || !requestId) return
    const target = entries.find((entry) => entry.response)
    const ref = target?.response?.bodyRef
    if (
      !target ||
      target.request.id !== requestId ||
      !ref ||
      target.response?.body !== undefined
    ) {
      return
    }

    let cancelled = false
    loadTimelineBody(collectionDir, requestId, ref)
      .then((body) => {
        if (cancelled || !mountedRef.current) return
        setEntries((current) =>
          current.map((entry) =>
            entry === target
              ? { ...entry, response: { ...entry.response!, body } }
              : entry,
          ),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [collectionDir, entries, hydrateLatestResponseBody, requestId])

  const appendEntry = useCallback(
    async (entry: TimelineEntry) => {
      if (!collectionDir) return
      if (maxEntries === 0) return
      const key = `${collectionDir}||${entry.request.id}||${maxEntries}`
      const save = saveChainRef.current.then(() =>
        saveTimelineEntry(collectionDir, entry.request.id, entry, maxEntries),
      )
      saveChainRef.current = save.then(() => {}).catch(() => {})
      const persisted = await save
      if (!mountedRef.current || lastKeyRef.current !== key) return
      appendedDuringLoadRef.current?.unshift(persisted)
      appendedDuringLoadRef.current?.splice(maxEntries)
      setEntries((prev) =>
        [persisted, ...prev.filter((entry) => entry.id !== persisted.id)].slice(
          0,
          maxEntries,
        ),
      )
    },
    [collectionDir, maxEntries],
  )

  return { entries, loading, appendEntry, reload: doLoad }
}
