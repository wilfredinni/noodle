import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collection, CollectionItem, Request } from "../schema"
import type { SystemProxySettings } from "../proxy"
import {
  collectionRun,
  selectCollectionRunRequests,
  type CollectionRunResult,
  type RequestRunDetail,
  type RequestRunResult,
} from "../app/services"
import { findFolderByPath, flattenRequests } from "../ui/tree"
import { nextIndex } from "../ui/selection"
import { effectiveRequestTags } from "../tags"

export type RunnerPhase = "configure" | "running" | "results"
export type RunnerResultRow =
  | { kind: "result"; id: string; result: RequestRunResult }
  | { kind: "skipped"; id: string; reason: "fail-fast" }

export interface UseCollectionRunnerOptions {
  collection: Collection | null
  collectionDir: string
  folderPath: string | null
  activeEnvironment: string | null
  environmentNames: string[]
  hasUnsavedChanges: boolean
  noProxy: boolean
  systemProxy: SystemProxySettings
  insecure: boolean
  resetKey: number
  runCollection?: typeof collectionRun
}

export interface UseCollectionRunnerResult {
  phase: RunnerPhase
  scopeLabel: string
  items: CollectionItem[]
  requests: Request[]
  requestTags: Map<string, string[]>
  selectedIds: Set<string>
  matchedIds: Set<string>
  previewError: string | null
  environmentName: string | null
  environmentNames: string[]
  includeTag: string
  excludeTag: string
  failFast: boolean
  optionIndex: number
  requestIndex: number
  requestRowIndex: number
  resultIndex: number
  resultDetails: Map<string, RequestRunDetail>
  selectOpen: boolean
  progress: { completed: number; total: number }
  result: CollectionRunResult | null
  resultRows: RunnerResultRow[]
  runError: string | null
  runAvailable: boolean
  canRun: boolean
  setEnvironmentName: (name: string | null) => void
  setTagFilter: (filter: "include" | "exclude", tag: string) => void
  setSelectOpen: (open: boolean) => void
  setOptionIndex: (index: number) => void
  setRequestIndex: (index: number) => void
  setRequestRowIndex: (index: number) => void
  setResultIndex: (index: number) => void
  optionUp: () => void
  optionDown: () => void
  optionFirst: () => void
  optionLast: () => void
  requestUp: () => void
  requestDown: () => void
  requestFirst: () => void
  requestLast: () => void
  resultUp: () => void
  resultDown: () => void
  resultFirst: () => void
  resultLast: () => void
  toggleSelected: (index?: number) => void
  toggleFolder: (path: string) => void
  toggleFailFast: () => void
  showConfigure: () => void
  showResults: () => void
  run: () => Promise<void>
}

export const RUNNER_RUN_OPTION_INDEX = 4
const OPTION_COUNT = RUNNER_RUN_OPTION_INDEX + 1

type RunnerNavigationRow =
  | { kind: "folder"; path: string }
  | { kind: "request"; index: number }

function flattenRunnerNavigationRows(
  items: CollectionItem[],
  requestIndexById: Map<string, number>,
  rows: RunnerNavigationRow[] = [],
): RunnerNavigationRow[] {
  for (const item of items) {
    if (item.type === "folder") {
      rows.push({ kind: "folder", path: item.data.path })
      flattenRunnerNavigationRows(item.data.children, requestIndexById, rows)
      continue
    }
    const index = requestIndexById.get(item.data.id)
    if (index !== undefined) rows.push({ kind: "request", index })
  }
  return rows
}

export function useCollectionRunner({
  collection,
  collectionDir,
  folderPath,
  activeEnvironment,
  environmentNames,
  hasUnsavedChanges,
  noProxy,
  systemProxy,
  insecure,
  resetKey,
  runCollection = collectionRun,
}: UseCollectionRunnerOptions): UseCollectionRunnerResult {
  const items = useMemo(() => {
    if (!collection) return []
    if (!folderPath) return collection.items
    return findFolderByPath(collection.items, folderPath)?.children ?? []
  }, [collection, folderPath])
  const requests = useMemo(() => flattenRequests(items), [items])
  const navigationRows = useMemo(() => {
    const requestIndexById = new Map(
      requests.map((request, index) => [request.id, index]),
    )
    return flattenRunnerNavigationRows(items, requestIndexById)
  }, [items, requests])
  const requestTags = useMemo(() => {
    const tags = effectiveRequestTags(collection?.items ?? [])
    return new Map(
      requests.map((request) => [
        request.id,
        [...(tags.get(request.id) ?? [])],
      ]),
    )
  }, [collection, requests])
  const [phase, setPhase] = useState<RunnerPhase>("configure")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [environmentName, setEnvironmentName] = useState<string | null>(null)
  const [includeTag, setIncludeTag] = useState("")
  const [excludeTag, setExcludeTag] = useState("")
  const [failFast, setFailFast] = useState(false)
  const [optionIndex, setOptionIndexState] = useState(0)
  const [selectOpen, setSelectOpen] = useState(false)
  const [requestIndex, setRequestIndexState] = useState(0)
  const [requestRowIndex, setRequestRowIndex] = useState(0)
  const [resultIndex, setResultIndex] = useState(0)
  const [resultDetails, setResultDetails] = useState<
    Map<string, RequestRunDetail>
  >(new Map())
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [result, setResult] = useState<CollectionRunResult | null>(null)
  const [runRequestIds, setRunRequestIds] = useState<string[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const runningRef = useRef(false)
  const setOptionIndex = useCallback(
    (index: number) => {
      if (
        phase === "running" ||
        selectOpen ||
        index < 0 ||
        index >= OPTION_COUNT
      )
        return
      setOptionIndexState(index)
    },
    [phase, selectOpen],
  )
  const setTagFilter = useCallback(
    (filter: "include" | "exclude", tag: string) => {
      if (phase === "running") return
      if (filter === "include") setIncludeTag(tag)
      else setExcludeTag(tag)
    },
    [phase],
  )

  useEffect(() => {
    setPhase("configure")
    setSelectedIds(new Set(requests.map((request) => request.id)))
    setEnvironmentName(activeEnvironment)
    setIncludeTag("")
    setExcludeTag("")
    setFailFast(false)
    setOptionIndexState(0)
    setSelectOpen(false)
    setRequestIndexState(0)
    setRequestRowIndex(0)
    setResultIndex(0)
    setResultDetails(new Map())
    setProgress({ completed: 0, total: 0 })
    setResult(null)
    setRunRequestIds([])
    setRunError(null)
  }, [resetKey])

  const selectedRequestIds = useMemo(
    () =>
      requests
        .filter((request) => selectedIds.has(request.id))
        .map((request) => request.id),
    [requests, selectedIds],
  )

  const preview = useMemo(() => {
    if (!collection || selectedRequestIds.length === 0) {
      return { ids: new Set<string>(), error: null }
    }
    try {
      const selected = selectCollectionRunRequests(
        collection.items,
        selectedRequestIds,
        includeTag || undefined,
        excludeTag || undefined,
      )
      return {
        ids: new Set(selected.map((request) => request.id)),
        error: null,
      }
    } catch (error) {
      return {
        ids: new Set<string>(),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }, [collection, excludeTag, includeTag, selectedRequestIds])

  const resultRows = useMemo(() => {
    if (!result) return []
    const results = new Map(result.results.map((entry) => [entry.id, entry]))
    const skipped = new Map(result.skipped.map((entry) => [entry.id, entry]))
    return runRequestIds.flatMap((id): RunnerResultRow[] => {
      const entry = results.get(id)
      if (entry) return [{ kind: "result", id, result: entry }]
      const skip = skipped.get(id)
      return skip ? [{ kind: "skipped", id, reason: skip.reason }] : []
    })
  }, [result, runRequestIds])

  const moveOption = useCallback(
    (direction: 1 | -1) => {
      if (phase === "running" || selectOpen) return
      setOptionIndexState((index) =>
        Math.max(0, Math.min(OPTION_COUNT - 1, index + direction)),
      )
    },
    [phase, selectOpen],
  )
  const optionUp = useCallback(() => moveOption(-1), [moveOption])
  const optionDown = useCallback(() => moveOption(1), [moveOption])
  const optionFirst = useCallback(() => setOptionIndex(0), [setOptionIndex])
  const optionLast = useCallback(
    () => setOptionIndex(OPTION_COUNT - 1),
    [setOptionIndex],
  )
  const requestUp = useCallback(
    () =>
      setRequestRowIndex((index) =>
        nextIndex(index, navigationRows.length, -1),
      ),
    [navigationRows.length],
  )
  const requestDown = useCallback(
    () =>
      setRequestRowIndex((index) => nextIndex(index, navigationRows.length, 1)),
    [navigationRows.length],
  )
  const requestFirst = useCallback(() => setRequestRowIndex(0), [])
  const requestLast = useCallback(
    () => setRequestRowIndex(Math.max(0, navigationRows.length - 1)),
    [navigationRows.length],
  )
  useEffect(() => {
    const row = navigationRows[requestRowIndex]
    if (row?.kind === "request") setRequestIndexState(row.index)
  }, [navigationRows, requestRowIndex])
  const resultUp = useCallback(
    () => setResultIndex((index) => nextIndex(index, resultRows.length, -1)),
    [resultRows.length],
  )
  const resultDown = useCallback(
    () => setResultIndex((index) => nextIndex(index, resultRows.length, 1)),
    [resultRows.length],
  )
  const resultFirst = useCallback(() => setResultIndex(0), [])
  const resultLast = useCallback(
    () => setResultIndex(Math.max(0, resultRows.length - 1)),
    [resultRows.length],
  )
  const toggleFolder = useCallback(
    (path: string) => {
      if (phase === "running") return
      const ids = requests
        .filter((request) => request.id.startsWith(`${path}/`))
        .map((request) => request.id)
      if (ids.length === 0) return
      setSelectedIds((current) => {
        const select = !ids.every((id) => current.has(id))
        const next = new Set(current)
        for (const id of ids) {
          if (select) next.add(id)
          else next.delete(id)
        }
        return next
      })
    },
    [phase, requests],
  )
  const setRequestIndex = useCallback(
    (index: number) => {
      setRequestIndexState(index)
      const rowIndex = navigationRows.findIndex(
        (row) => row.kind === "request" && row.index === index,
      )
      if (rowIndex >= 0) setRequestRowIndex(rowIndex)
    },
    [navigationRows],
  )
  const toggleSelected = useCallback(
    (index?: number) => {
      if (index === undefined) {
        const row = navigationRows[requestRowIndex]
        if (row?.kind === "folder") {
          toggleFolder(row.path)
          return
        }
        index = row?.kind === "request" ? row.index : requestIndex
      }
      const id = requests[index]?.id
      if (!id || phase === "running") return
      setSelectedIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [
      navigationRows,
      phase,
      requestIndex,
      requestRowIndex,
      requests,
      toggleFolder,
    ],
  )
  const toggleFailFast = useCallback(() => {
    if (phase !== "running") setFailFast((value) => !value)
  }, [phase])

  const runAvailable =
    phase !== "running" &&
    !hasUnsavedChanges &&
    selectedRequestIds.length > 0 &&
    preview.ids.size > 0 &&
    preview.error === null
  const canRun = runAvailable && !selectOpen

  const run = useCallback(async () => {
    if (
      phase === "running" ||
      runningRef.current ||
      hasUnsavedChanges ||
      selectOpen ||
      !collection ||
      selectedRequestIds.length === 0
    )
      return
    let nextRequests: Request[]
    try {
      nextRequests = selectCollectionRunRequests(
        collection.items,
        selectedRequestIds,
        includeTag || undefined,
        excludeTag || undefined,
      )
    } catch {
      return
    }
    if (nextRequests.length === 0) return
    runningRef.current = true
    const ids = nextRequests.map((request) => request.id)
    setRunRequestIds(ids)
    setRunError(null)
    setResult(null)
    setResultIndex(0)
    setResultDetails(new Map())
    setProgress({ completed: 0, total: ids.length })
    setPhase("running")
    try {
      const nextDetails = new Map<string, RequestRunDetail>()
      const next = await runCollection(
        collectionDir,
        environmentName ?? undefined,
        (completed, total) => setProgress({ completed, total }),
        noProxy,
        systemProxy,
        insecure,
        selectedRequestIds,
        includeTag || undefined,
        excludeTag || undefined,
        failFast,
        (detail) => nextDetails.set(detail.requestId, detail),
      )
      setResultDetails(nextDetails)
      setResult(next)
      setPhase("results")
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error))
      setPhase("configure")
    } finally {
      runningRef.current = false
    }
  }, [
    collection,
    collectionDir,
    environmentName,
    excludeTag,
    failFast,
    hasUnsavedChanges,
    includeTag,
    insecure,
    noProxy,
    phase,
    runCollection,
    selectOpen,
    selectedRequestIds,
    systemProxy,
  ])

  return {
    phase,
    scopeLabel: folderPath ? `Folder: ${folderPath}` : "Entire collection",
    items,
    requests,
    requestTags,
    selectedIds,
    matchedIds: preview.ids,
    previewError: preview.error,
    environmentName,
    environmentNames,
    includeTag,
    excludeTag,
    failFast,
    optionIndex,
    requestIndex,
    requestRowIndex,
    resultIndex,
    resultDetails,
    selectOpen,
    progress,
    result,
    resultRows,
    runError,
    runAvailable,
    canRun,
    setEnvironmentName,
    setTagFilter,
    setSelectOpen,
    setOptionIndex,
    setRequestIndex,
    setRequestRowIndex,
    setResultIndex,
    optionUp,
    optionDown,
    optionFirst,
    optionLast,
    requestUp,
    requestDown,
    requestFirst,
    requestLast,
    resultUp,
    resultDown,
    resultFirst,
    resultLast,
    toggleSelected,
    toggleFolder,
    toggleFailFast,
    showConfigure: () => result && setPhase("configure"),
    showResults: () => result && setPhase("results"),
    run,
  }
}
