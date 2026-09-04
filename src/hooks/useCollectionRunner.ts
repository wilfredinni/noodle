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
export type RunnerTagFilter = "include" | "exclude"
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
  includeTags: string[]
  excludeTags: string[]
  includeTagIndex: number
  excludeTagIndex: number
  failFast: boolean
  delayMsInput: string
  delayError: string | null
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
  setTagFilter: (filter: RunnerTagFilter, index: number, tag: string) => void
  deleteTagFilter: (filter: RunnerTagFilter, index: number) => void
  setTagFilterIndex: (filter: RunnerTagFilter, index: number) => void
  setSelectOpen: (open: boolean) => void
  setDelayMsInput: (value: string) => void
  setOptionIndex: (index: number) => void
  setRequestIndex: (index: number) => void
  setRequestRowIndex: (index: number) => void
  setResultIndex: (index: number) => void
  optionUp: () => void
  optionDown: () => void
  optionFirst: () => void
  optionLast: () => void
  tagPrevious: () => void
  tagNext: () => void
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

export const RUNNER_RUN_OPTION_INDEX = 5
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
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [includeTagIndex, setIncludeTagIndex] = useState(0)
  const [excludeTagIndex, setExcludeTagIndex] = useState(0)
  const [failFast, setFailFast] = useState(false)
  const [delayMsInput, setDelayMsInputState] = useState("0")
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
  const parsedDelayMs = Number(delayMsInput)
  const delayMs =
    delayMsInput.trim() !== "" &&
    Number.isSafeInteger(parsedDelayMs) &&
    parsedDelayMs >= 0
      ? parsedDelayMs
      : null
  const delayError =
    delayMs === null ? "Delay must be a non-negative safe integer." : null
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
  const setTagFilterIndex = useCallback(
    (filter: RunnerTagFilter, index: number) => {
      if (phase === "running") return
      const limit =
        filter === "include" ? includeTags.length : excludeTags.length
      const next = Math.max(0, Math.min(limit, index))
      if (filter === "include") setIncludeTagIndex(next)
      else setExcludeTagIndex(next)
    },
    [excludeTags.length, includeTags.length, phase],
  )
  const setTagFilter = useCallback(
    (filter: RunnerTagFilter, index: number, tag: string) => {
      if (phase === "running") return
      const current = filter === "include" ? includeTags : excludeTags
      if (index < 0 || index > current.length) return
      const next = [...current]
      if (index === next.length) next.push(tag)
      else next[index] = tag
      const unique = [...new Set(next)]
      if (filter === "include") {
        setIncludeTags(unique)
        setIncludeTagIndex(unique.indexOf(tag))
      } else {
        setExcludeTags(unique)
        setExcludeTagIndex(unique.indexOf(tag))
      }
    },
    [excludeTags, includeTags, phase],
  )
  const deleteTagFilter = useCallback(
    (filter: RunnerTagFilter, index: number) => {
      if (phase === "running") return
      const current = filter === "include" ? includeTags : excludeTags
      if (index < 0 || index >= current.length) return
      const next = current.filter((_, currentIndex) => currentIndex !== index)
      const nextIndex = next.length === 0 ? 0 : Math.min(index, next.length - 1)
      if (filter === "include") {
        setIncludeTags(next)
        setIncludeTagIndex(nextIndex)
      } else {
        setExcludeTags(next)
        setExcludeTagIndex(nextIndex)
      }
    },
    [excludeTags, includeTags, phase],
  )

  useEffect(() => {
    setPhase("configure")
    setSelectedIds(new Set(requests.map((request) => request.id)))
    setEnvironmentName(activeEnvironment)
    setIncludeTags([])
    setExcludeTags([])
    setIncludeTagIndex(0)
    setExcludeTagIndex(0)
    setFailFast(false)
    setDelayMsInputState("0")
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

  const eligibleIds = useMemo(() => {
    if (!collection || requests.length === 0) {
      return new Set<string>()
    }
    try {
      return new Set(
        selectCollectionRunRequests(
          collection.items,
          requests.map((request) => request.id),
          includeTags,
          excludeTags,
        ).map((request) => request.id),
      )
    } catch {
      return new Set<string>()
    }
  }, [collection, excludeTags, includeTags, requests])

  const preview = useMemo(() => {
    if (!collection || selectedRequestIds.length === 0) {
      return { ids: new Set<string>(), error: null }
    }
    try {
      const selected = selectCollectionRunRequests(
        collection.items,
        selectedRequestIds,
        includeTags,
        excludeTags,
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
  }, [collection, excludeTags, includeTags, selectedRequestIds])

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
  const moveTag = useCallback(
    (direction: -1 | 1) => {
      if (phase === "running" || selectOpen) return
      if (optionIndex === 1)
        setIncludeTagIndex((index) =>
          Math.max(0, Math.min(includeTags.length, index + direction)),
        )
      else if (optionIndex === 2)
        setExcludeTagIndex((index) =>
          Math.max(0, Math.min(excludeTags.length, index + direction)),
        )
    },
    [excludeTags.length, includeTags.length, optionIndex, phase, selectOpen],
  )
  const tagPrevious = useCallback(() => moveTag(-1), [moveTag])
  const tagNext = useCallback(() => moveTag(1), [moveTag])
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
        .filter(
          (request) =>
            request.id.startsWith(`${path}/`) && eligibleIds.has(request.id),
        )
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
    [eligibleIds, phase, requests],
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
      if (!id || phase === "running" || !eligibleIds.has(id)) return
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
      eligibleIds,
      requestIndex,
      requestRowIndex,
      requests,
      toggleFolder,
    ],
  )
  const toggleFailFast = useCallback(() => {
    if (phase !== "running") setFailFast((value) => !value)
  }, [phase])
  const setDelayMsInput = useCallback(
    (value: string) => {
      if (phase !== "running") setDelayMsInputState(value)
    },
    [phase],
  )

  const runAvailable =
    phase !== "running" &&
    !hasUnsavedChanges &&
    delayMs !== null &&
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
      delayMs === null ||
      !collection ||
      selectedRequestIds.length === 0
    )
      return
    let nextRequests: Request[]
    try {
      nextRequests = selectCollectionRunRequests(
        collection.items,
        selectedRequestIds,
        includeTags,
        excludeTags,
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
        includeTags,
        excludeTags,
        failFast,
        (detail) => nextDetails.set(detail.requestId, detail),
        delayMs,
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
    delayMs,
    environmentName,
    excludeTags,
    failFast,
    hasUnsavedChanges,
    includeTags,
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
    includeTags,
    excludeTags,
    includeTagIndex,
    excludeTagIndex,
    failFast,
    delayMsInput,
    delayError,
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
    deleteTagFilter,
    setTagFilterIndex,
    setSelectOpen,
    setDelayMsInput,
    setOptionIndex,
    setRequestIndex,
    setRequestRowIndex,
    setResultIndex,
    optionUp,
    optionDown,
    optionFirst,
    optionLast,
    tagPrevious,
    tagNext,
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
