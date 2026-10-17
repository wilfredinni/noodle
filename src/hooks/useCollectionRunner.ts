import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collection, CollectionItem, Request } from "../schema"
import type { SystemProxySettings } from "../proxy"
import {
  collectionRun,
  RUN_FAILURE_CATEGORIES,
  selectCollectionRunRequests,
  summarizeRun,
  type CollectionRunResult,
  type RequestRunDetail,
  type RequestRunResult,
} from "../app/services"
import { findFolderByPath, flattenRequests } from "../ui/tree"
import { nextIndex } from "../ui/selection"
import { effectiveRequestTags } from "../tags"
import { resolve } from "node:path"
import { expandUserPath } from "../userPath"
import { DATA_LIMITS, loadIterationData, runResultKey } from "../iterationData"

export type RunnerPhase = "configure" | "running" | "results"
export type RunnerTagFilter = "include" | "exclude"
export type RunnerResultRow =
  | { kind: "pending" | "running"; id: string }
  | { kind: "result"; id: string; result: RequestRunResult }
  | { kind: "skipped"; id: string; reason: "fail-fast" | "cancelled" }

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
  collectionDir: string
  phase: RunnerPhase
  stopping: boolean
  stop: () => void
  isRunning: () => boolean
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
  dataPath: string
  dataError: string | null
  iterationCount: number | null
  setDataPath: (value: string) => Promise<void>
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

export const RUNNER_RUN_OPTION_INDEX = 6
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
  const [environmentName, setEnvironmentNameState] = useState<string | null>(
    null,
  )
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [includeTagIndex, setIncludeTagIndex] = useState(0)
  const [excludeTagIndex, setExcludeTagIndex] = useState(0)
  const [failFast, setFailFast] = useState(false)
  const [delayMsInput, setDelayMsInputState] = useState("0")
  const [dataPath, setDataPathState] = useState("")
  const dataPathRef = useRef("")
  const [dataPreview, setDataPreview] = useState<{
    path: string
    count: number | null
    error: string | null
  }>({ path: "", count: 1, error: null })
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
  const [runError, setRunError] = useState<string | null>(null)
  const runningRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const [stopping, setStopping] = useState(false)
  const [liveRows, setLiveRows] = useState<RunnerResultRow[]>([])
  const isRunning = useCallback(() => runningRef.current, [])
  const stop = useCallback(() => {
    if (!runningRef.current || controllerRef.current?.signal.aborted) return
    controllerRef.current?.abort()
    setStopping(true)
  }, [])
  const setEnvironmentName = useCallback((name: string | null) => {
    if (!runningRef.current) setEnvironmentNameState(name)
  }, [])
  useEffect(
    () => () => {
      generationRef.current++
      controllerRef.current?.abort()
      runningRef.current = false
    },
    [],
  )
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
        (runningRef.current && index !== RUNNER_RUN_OPTION_INDEX) ||
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
      if (runningRef.current) return
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
      if (runningRef.current) return
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
      if (runningRef.current) return
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
    generationRef.current++
    controllerRef.current?.abort()
    controllerRef.current = null
    runningRef.current = false
    setStopping(false)
    setLiveRows([])
    setPhase("configure")
    setSelectedIds(new Set(requests.map((request) => request.id)))
    setEnvironmentNameState(activeEnvironment)
    setIncludeTags([])
    setExcludeTags([])
    setIncludeTagIndex(0)
    setExcludeTagIndex(0)
    setFailFast(false)
    setDelayMsInputState("0")
    setDataPathState("")
    dataPathRef.current = ""
    setOptionIndexState(0)
    setSelectOpen(false)
    setRequestIndexState(0)
    setRequestRowIndex(0)
    setResultIndex(0)
    setResultDetails(new Map())
    setProgress({ completed: 0, total: 0 })
    setResult(null)
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

  const iterationCount = !dataPath
    ? 1
    : dataPreview.path === dataPath
      ? dataPreview.count
      : null
  const dataError = !dataPath
    ? null
    : dataPreview.path !== dataPath
      ? "Validating data file…"
      : (dataPreview.error ??
        ((iterationCount ?? 0) * preview.ids.size > DATA_LIMITS.executions
          ? "Data run exceeds 10,000 request executions"
          : null))
  const setDataPath = useCallback(
    async (path: string) => {
      if (runningRef.current) return
      dataPathRef.current = path
      setDataPathState(path)
      if (!path) {
        setDataPreview({ path, count: 1, error: null })
        return
      }
      setDataPreview({ path, count: null, error: "Validating data file…" })
      try {
        const rows = await loadIterationData(
          expandUserPath(path),
          collectionDir,
        )
        if (dataPathRef.current === path)
          setDataPreview({ path, count: rows.length, error: null })
      } catch (error) {
        if (dataPathRef.current === path)
          setDataPreview({
            path,
            count: null,
            error: error instanceof Error ? error.message : String(error),
          })
      }
    },
    [phase, collectionDir],
  )

  const resultRows = useMemo(() => {
    if (runningRef.current) return liveRows
    if (!result) return []
    return [
      ...result.results.map((entry): RunnerResultRow => ({
        kind: "result",
        id: runResultKey(entry.id, entry.iteration),
        result: entry,
      })),
      ...result.skipped.map((entry): RunnerResultRow => ({
        kind: "skipped",
        id: runResultKey(entry.id, entry.iteration),
        reason: entry.reason,
      })),
    ]
  }, [result, phase, liveRows])

  const moveOption = useCallback(
    (direction: 1 | -1) => {
      if (runningRef.current || selectOpen) return
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
    () =>
      setResultIndex((index) =>
        Math.max(0, nextIndex(index, resultRows.length, -1)),
      ),
    [resultRows.length],
  )
  const resultDown = useCallback(
    () =>
      setResultIndex((index) =>
        Math.max(0, nextIndex(index, resultRows.length, 1)),
      ),
    [resultRows.length],
  )
  const resultFirst = useCallback(() => setResultIndex(0), [])
  const resultLast = useCallback(
    () => setResultIndex(Math.max(0, resultRows.length - 1)),
    [resultRows.length],
  )
  const toggleFolder = useCallback(
    (path: string) => {
      if (runningRef.current) return
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
      if (!id || runningRef.current || !eligibleIds.has(id)) return
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
    if (!runningRef.current) setFailFast((value) => !value)
  }, [phase])
  const setDelayMsInput = useCallback(
    (value: string) => {
      if (!runningRef.current) setDelayMsInputState(value)
    },
    [phase],
  )

  const runAvailable =
    phase !== "running" &&
    !hasUnsavedChanges &&
    delayMs !== null &&
    dataError === null &&
    iterationCount !== null &&
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
      dataError !== null ||
      iterationCount === null ||
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
    const generation = ++generationRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    const current = () =>
      generationRef.current === generation &&
      controllerRef.current === controller
    const startedAt = performance.now()
    let rows: RunnerResultRow[] = []
    const rowIndices = new Map<string, number>()
    let publishTimer: ReturnType<typeof setTimeout> | undefined
    const details = new Map<string, RequestRunDetail>()
    let nextProgress = {
      completed: 0,
      total: nextRequests.length * iterationCount,
    }
    let partial: CollectionRunResult = {
      results: [],
      skipped: [],
      failed: false,
      summary: summarizeRun(
        [],
        nextRequests.length * iterationCount,
        0,
        startedAt,
      ),
    }
    const publish = () => {
      if (publishTimer !== undefined) return
      publishTimer = setTimeout(() => {
        publishTimer = undefined
        if (!current()) return
        setLiveRows([...rows])
        setResult({
          ...partial,
          results: [...partial.results],
          skipped: [...partial.skipped],
          summary: {
            ...partial.summary,
            durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          },
        })
        setResultDetails(new Map(details))
        setProgress(nextProgress)
      }, 50)
    }
    const ids = nextRequests.map((request) => request.id)
    setRunError(null)
    setStopping(false)
    setResult({ ...partial, results: [], skipped: [] })
    setLiveRows([])
    setOptionIndexState(RUNNER_RUN_OPTION_INDEX)
    setResultIndex(0)
    setResultDetails(new Map())
    setProgress({ completed: 0, total: ids.length * iterationCount })
    setPhase("running")
    try {
      const next = await runCollection(
        collectionDir,
        environmentName ?? undefined,
        (completed, total) => {
          if (current()) {
            nextProgress = { completed, total }
            publish()
          }
        },
        noProxy,
        systemProxy,
        insecure,
        selectedRequestIds,
        includeTags,
        excludeTags,
        failFast,
        (detail) => {
          if (!current()) return
          details.set(runResultKey(detail.requestId, detail.iteration), detail)
          publish()
        },
        delayMs,
        dataPath ? resolve(collectionDir, expandUserPath(dataPath)) : undefined,
        true,
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (!current()) return
            if (event.type === "run-start") {
              partial = {
                ...partial,
                ...(event.iterations !== undefined
                  ? { iterations: event.iterations }
                  : {}),
              }
              rows = Array.from(
                { length: event.iterations ?? 1 },
                (_, iteration) =>
                  event.requestIds.map((id): RunnerResultRow => ({
                    kind: "pending",
                    id: runResultKey(
                      id,
                      event.iterations === undefined ? undefined : iteration,
                    ),
                  })),
              ).flat()
              rowIndices.clear()
              rows.forEach((row, index) => rowIndices.set(row.id, index))
              nextProgress = { completed: 0, total: rows.length }
              partial.summary.selected = rows.length
              partial.summary.unstarted = rows.length
            } else {
              const id = runResultKey(event.id, event.iteration)
              const index = rowIndices.get(id)
              let row: RunnerResultRow
              if (event.type === "request-start") row = { kind: "running", id }
              else if (event.type === "request-complete") {
                row = { kind: "result", id, result: event.result }
                partial.results.push(event.result)
                const delta = summarizeRun([event.result], 1, 0, startedAt)
                partial.summary = { ...partial.summary }
                for (const key of [
                  "executed",
                  "completed",
                  "cancelled",
                  "requestSuccesses",
                  "requestFailures",
                  "assertionPasses",
                  "assertionFailures",
                  "captureFailures",
                  "testPasses",
                  "testFailures",
                  "testScriptErrors",
                ] as const) {
                  if (delta[key] !== undefined)
                    partial.summary[key] =
                      (partial.summary[key] ?? 0) + delta[key]
                }
                partial.summary.unstarted--
                partial.summary.failureCategories =
                  RUN_FAILURE_CATEGORIES.filter(
                    (category) =>
                      partial.summary.failureCategories.includes(category) ||
                      delta.failureCategories.includes(category),
                  )
                partial.failed ||= !event.result.ok
              } else {
                row = { kind: "skipped", id, reason: event.reason }
                partial.summary = {
                  ...partial.summary,
                  skipped: partial.summary.skipped + 1,
                }
                partial.skipped.push({
                  id: event.id,
                  iteration: event.iteration,
                  reason: event.reason,
                })
              }
              if (index !== undefined) rows[index] = row
              else {
                rowIndices.set(id, rows.length)
                rows.push(row)
              }
            }
            publish()
          },
        },
      )
      if (!current()) return
      setResult(next)
      if (next.failure) {
        setRunError(next.failure.message)
        setPhase("configure")
      } else setPhase("results")
    } catch (error) {
      if (!current()) return
      const cancelled =
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      const message = error instanceof Error ? error.message : String(error)
      setRunError(cancelled ? null : message)
      setResult({
        ...partial,
        failed: true,
        ...(cancelled
          ? { cancelled: true as const }
          : { failure: { category: "configuration" as const, message } }),
        summary: summarizeRun(
          partial.results,
          rows.length || ids.length * iterationCount,
          partial.skipped.length,
          startedAt,
          !cancelled,
        ),
      })
      setPhase(cancelled ? "results" : "configure")
    } finally {
      clearTimeout(publishTimer)
      if (current()) {
        setResultDetails(new Map(details))
        setProgress(nextProgress)
        runningRef.current = false
        controllerRef.current = null
        setStopping(false)
      }
    }
  }, [
    collection,
    collectionDir,
    delayMs,
    dataPath,
    dataError,
    iterationCount,
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
    collectionDir,
    phase,
    stopping,
    stop,
    isRunning,
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
    dataPath,
    dataError,
    iterationCount,
    setDataPath,
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
    showConfigure: () => !runningRef.current && result && setPhase("configure"),
    showResults: () => !runningRef.current && result && setPhase("results"),
    run,
  }
}
