import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collection, Request } from "../schema"
import type { SystemProxySettings } from "../proxy"
import {
  collectionRun,
  selectCollectionRunRequests,
  type CollectionRunResult,
  type RequestRunResult,
} from "../app/services"
import { flattenRequests } from "../ui/tree"
import { nextIndex } from "../ui/selection"

export type RunnerPhase = "configure" | "running" | "results"
export type RunnerEditingOption = "include" | "exclude" | null
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
  requests: Request[]
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
  resultIndex: number
  editingOption: RunnerEditingOption
  editValue: string
  selectOpen: boolean
  progress: { completed: number; total: number }
  result: CollectionRunResult | null
  resultRows: RunnerResultRow[]
  runError: string | null
  canRun: boolean
  setEnvironmentName: (name: string | null) => void
  setSelectOpen: (open: boolean) => void
  setEditValue: (value: string) => void
  setOptionIndex: (index: number) => void
  setRequestIndex: (index: number) => void
  setResultIndex: (index: number) => void
  optionUp: () => void
  optionDown: () => void
  requestUp: () => void
  requestDown: () => void
  requestFirst: () => void
  requestLast: () => void
  resultUp: () => void
  resultDown: () => void
  resultFirst: () => void
  resultLast: () => void
  toggleSelected: (index?: number) => void
  toggleFailFast: () => void
  activateOption: () => void
  beginOptionEdit: (option: "include" | "exclude") => void
  commitOptionEdit: () => void
  cancelOptionEdit: () => void
  showConfigure: () => void
  showResults: () => void
  run: () => Promise<void>
}

const OPTION_COUNT = 6

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
  const requests = useMemo(() => {
    const all = flattenRequests(collection?.items ?? [])
    if (!folderPath) return all
    const prefix = `${folderPath}/`
    return all.filter((request) => request.id.startsWith(prefix))
  }, [collection, folderPath])
  const [phase, setPhase] = useState<RunnerPhase>("configure")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [environmentName, setEnvironmentName] = useState<string | null>(null)
  const [includeTag, setIncludeTag] = useState("")
  const [excludeTag, setExcludeTag] = useState("")
  const [failFast, setFailFast] = useState(false)
  const [optionIndex, setOptionIndex] = useState(0)
  const [requestIndex, setRequestIndex] = useState(0)
  const [resultIndex, setResultIndex] = useState(0)
  const [editingOption, setEditingOption] = useState<RunnerEditingOption>(null)
  const [editValue, setEditValue] = useState("")
  const [selectOpen, setSelectOpen] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [result, setResult] = useState<CollectionRunResult | null>(null)
  const [runRequestIds, setRunRequestIds] = useState<string[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    setPhase("configure")
    setSelectedIds(new Set(requests.map((request) => request.id)))
    setEnvironmentName(activeEnvironment)
    setIncludeTag("")
    setExcludeTag("")
    setFailFast(false)
    setOptionIndex(0)
    setRequestIndex(0)
    setResultIndex(0)
    setEditingOption(null)
    setEditValue("")
    setSelectOpen(false)
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

  const optionUp = useCallback(
    () => setOptionIndex((index) => nextIndex(index, OPTION_COUNT, -1)),
    [],
  )
  const optionDown = useCallback(
    () => setOptionIndex((index) => nextIndex(index, OPTION_COUNT, 1)),
    [],
  )
  const requestUp = useCallback(
    () => setRequestIndex((index) => nextIndex(index, requests.length, -1)),
    [requests.length],
  )
  const requestDown = useCallback(
    () => setRequestIndex((index) => nextIndex(index, requests.length, 1)),
    [requests.length],
  )
  const requestFirst = useCallback(() => setRequestIndex(0), [])
  const requestLast = useCallback(
    () => setRequestIndex(Math.max(0, requests.length - 1)),
    [requests.length],
  )
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

  const toggleSelected = useCallback(
    (index = requestIndex) => {
      const id = requests[index]?.id
      if (!id || phase === "running") return
      setSelectedIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [phase, requestIndex, requests],
  )
  const toggleFailFast = useCallback(() => {
    if (phase !== "running") setFailFast((value) => !value)
  }, [phase])

  const beginOptionEdit = useCallback(
    (option: "include" | "exclude") => {
      if (phase === "running") return
      setEditingOption(option)
      setEditValue(option === "include" ? includeTag : excludeTag)
    },
    [excludeTag, includeTag, phase],
  )
  const commitOptionEdit = useCallback(() => {
    if (editingOption === "include") setIncludeTag(editValue)
    if (editingOption === "exclude") setExcludeTag(editValue)
    setEditingOption(null)
  }, [editValue, editingOption])
  const cancelOptionEdit = useCallback(() => {
    setEditingOption(null)
    setEditValue("")
  }, [])

  const canRun =
    phase !== "running" &&
    editingOption === null &&
    !selectOpen &&
    !hasUnsavedChanges &&
    selectedRequestIds.length > 0 &&
    preview.ids.size > 0 &&
    preview.error === null

  const run = useCallback(async () => {
    if (!canRun || runningRef.current) return
    runningRef.current = true
    const ids = requests
      .filter((request) => preview.ids.has(request.id))
      .map((request) => request.id)
    setRunRequestIds(ids)
    setRunError(null)
    setResult(null)
    setResultIndex(0)
    setProgress({ completed: 0, total: ids.length })
    setPhase("running")
    try {
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
      )
      setResult(next)
      setPhase("results")
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error))
      setPhase("configure")
    } finally {
      runningRef.current = false
    }
  }, [
    canRun,
    collectionDir,
    environmentName,
    excludeTag,
    failFast,
    includeTag,
    insecure,
    noProxy,
    preview.ids,
    requests,
    runCollection,
    selectedRequestIds,
    systemProxy,
  ])

  const activateOption = useCallback(() => {
    if (optionIndex === 2) beginOptionEdit("include")
    else if (optionIndex === 3) beginOptionEdit("exclude")
    else if (optionIndex === 4) toggleFailFast()
    else if (optionIndex === 5) void run()
  }, [beginOptionEdit, optionIndex, run, toggleFailFast])

  return {
    phase,
    scopeLabel: folderPath ? `Folder: ${folderPath}` : "Entire collection",
    requests,
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
    resultIndex,
    editingOption,
    editValue,
    selectOpen,
    progress,
    result,
    resultRows,
    runError,
    canRun,
    setEnvironmentName,
    setSelectOpen,
    setEditValue,
    setOptionIndex,
    setRequestIndex,
    setResultIndex,
    optionUp,
    optionDown,
    requestUp,
    requestDown,
    requestFirst,
    requestLast,
    resultUp,
    resultDown,
    resultFirst,
    resultLast,
    toggleSelected,
    toggleFailFast,
    activateOption,
    beginOptionEdit,
    commitOptionEdit,
    cancelOptionEdit,
    showConfigure: () => result && setPhase("configure"),
    showResults: () => result && setPhase("results"),
    run,
  }
}
