import { useCallback, useEffect, useRef, useState } from "react"
import type { TimelineEntry, Method, Folder } from "../schema"
import { loadTimeline } from "../filestore"

export interface RequestActivityStats {
  id: string
  name: string
  method: Method
  successRate: number | null
  avgTimeMs: number | null
  callCount: number
  lastSent: number | null
}

export interface FolderActivityStats {
  requests: RequestActivityStats[]
}

interface ChildRequest {
  id: string
  name: string
  method: Method
}

export function computeFolderActivity(
  childRequests: ChildRequest[],
  timelines: Map<string, TimelineEntry[]>,
): FolderActivityStats {
  const requests: RequestActivityStats[] = childRequests.map((req) => {
    const entries = timelines.get(req.id) ?? []
    const successEntries = entries.filter((e) => e.response !== undefined)
    const callCount = entries.length
    const successRate = callCount > 0 ? successEntries.length / callCount : null
    const avgTimeMs =
      successEntries.length > 0
        ? Math.round(
            successEntries.reduce((s, e) => s + (e.response?.timeMs ?? 0), 0) /
              successEntries.length,
          )
        : null
    const lastSent = entries.length > 0 ? entries[0]!.timestamp : null

    return {
      id: req.id,
      name: req.name,
      method: req.method,
      successRate,
      avgTimeMs,
      callCount,
      lastSent,
    }
  })

  return { requests }
}

export function useFolderActivity(
  collectionDir: string,
  folder: Folder | null,
  active: boolean,
): { stats: FolderActivityStats | null; loading: boolean } {
  const [stats, setStats] = useState<FolderActivityStats | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)
  const lastDirRef = useRef("")
  const lastPathRef = useRef("")
  const loadIdRef = useRef(0)

  const compute = useCallback(async () => {
    const loadId = ++loadIdRef.current

    if (!folder) {
      setStats(null)
      return
    }

    const childRequests = folder.children
      .filter((c) => c.type === "request")
      .map((c) => ({
        id: c.data.id,
        name: c.data.name,
        method: c.data.method,
      }))

    if (childRequests.length === 0) {
      setStats(computeFolderActivity([], new Map()))
      return
    }

    if (loadId !== loadIdRef.current) return

    setLoading(true)
    try {
      const timelines = new Map<string, TimelineEntry[]>()
      for (const req of childRequests) {
        const entries = await loadTimeline(collectionDir, req.id)
        timelines.set(req.id, entries)
        if (loadId !== loadIdRef.current) return
      }
      if (loadId !== loadIdRef.current) return
      setStats(computeFolderActivity(childRequests, timelines))
    } catch {
      if (loadId !== loadIdRef.current) return
      setStats(null)
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false)
      }
    }
  }, [collectionDir, folder])

  useEffect(() => {
    const path = folder?.path ?? ""
    if (collectionDir !== lastDirRef.current || path !== lastPathRef.current) {
      lastDirRef.current = collectionDir
      lastPathRef.current = path
      loadedRef.current = false
      setStats(null)
    }
  }, [collectionDir, folder])

  useEffect(() => {
    if (active && !loadedRef.current && folder) {
      loadedRef.current = true
      compute()
    }
  }, [active, folder, compute])

  return { stats, loading }
}
