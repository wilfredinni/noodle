import type { TimelineEntry, Method } from "../schema"

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
  summary: {
    totalCalls: number
    overallSuccessRate: number | null
    overallAvgTime: number | null
  }
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
            successEntries.reduce(
              (s, e) => s + (e.response?.timeMs ?? 0),
              0,
            ) / successEntries.length,
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

  const totalCalls = requests.reduce((s, r) => s + r.callCount, 0)
  const allSuccessEntries =
    totalCalls > 0
      ? requests.reduce((s, r) => {
          const count =
            r.successRate !== null ? r.successRate * r.callCount : 0
          return s + count
        }, 0) / totalCalls
      : null
  const allTimes = requests.flatMap((r) => {
    const entries = timelines.get(r.id) ?? []
    return entries
      .filter((e) => e.response !== undefined)
      .map((e) => e.response!.timeMs)
  })

  const overallAvgTime =
    allTimes.length > 0
      ? Math.round(allTimes.reduce((s, t) => s + t, 0) / allTimes.length)
      : null

  return {
    requests,
    summary: {
      totalCalls,
      overallSuccessRate: allSuccessEntries,
      overallAvgTime,
    },
  }
}
