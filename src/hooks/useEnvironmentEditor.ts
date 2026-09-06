import { useCallback, useEffect, useRef, useState } from "react"
import { env } from "../env"
import { dirname } from "node:path"
import type { Environment, SecretStatus } from "../schema"
import {
  deleteStoredSecret,
  getStoredSecret,
  setStoredSecret,
} from "../secrets"
import { isValidVariableName } from "../variableReference"

let nextVarId = 1

export interface VarRow {
  id: number
  key: string
  value: string
  enabled: boolean
  secret?: boolean
  originSecret?: boolean
  secretStatus?: SecretStatus
  valueChanged?: boolean
}

export interface EnvDraft {
  name: string
  color: string | undefined
  varRows: VarRow[]
}

export interface EnvEditState {
  mode: "inactive" | "browsing" | "editing"
  row: number
  addingRow: boolean
  subfield?: "key" | "value"
  editingRow: number
}

function initialEditState(): EnvEditState {
  return { mode: "inactive", row: -1, addingRow: false, editingRow: -1 }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function attemptRollback(
  failures: unknown[],
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    failures.push(error)
  }
}

function withRollbackFailures(original: unknown, failures: unknown[]): Error {
  if (failures.length === 0) {
    return original instanceof Error ? original : new Error(String(original))
  }
  return new Error(
    `${errorMessage(original)}; rollback failed: ${failures.map(errorMessage).join("; ")}`,
    { cause: original },
  )
}

interface OriginalEnv {
  name: string
  color: string | undefined
  vars: Record<string, string>
  disabledVars: Record<string, string>
  secretVars: Record<string, SecretStatus>
  varRows: VarRow[]
}

export interface UseEnvironmentEditorProps {
  environmentsDir: string
  envNames: string[]
  activeEnvName: string | undefined
  onEnvsChanged: (names?: string[]) => void | Promise<void>
  onActiveEnvChanged: (name: string) => void
  onEnvDataChanged?: () => void
}

function setOwn<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

export interface UseEnvironmentEditorResult {
  open: boolean
  envNames: string[]
  selectedEnvName: string | null
  draft: EnvDraft | null
  dirty: boolean
  editState: EnvEditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  saving: boolean
  error: string | null

  openEditor: (name?: string) => Promise<void>
  closeEditor: () => void
  selectEnv: (name: string) => Promise<boolean>
  setName: (name: string) => void
  setColor: (color: string | undefined) => void
  enterBrowse: () => void
  exitBrowse: () => void
  browseUp: () => void
  browseDown: () => void
  browseFirst: () => void
  browseLast: () => void
  enterEdit: () => void
  activateVar: (
    row: number,
    addingRow?: boolean,
    subfield?: "key" | "value",
  ) => void
  commitEdit: () => void
  cancelEdit: () => void
  browseTab: () => void
  toggleVar: (index: number) => void
  toggleSecret: (index: number) => void
  toggleReveal: (index: number) => void
  revealedRowId: number | null
  clonePrompt: { source: string; target: string } | null
  confirmClone: (copySecrets: boolean) => Promise<void>
  remaskSecrets: () => void
  revertVar: (index: number) => void
  save: () => Promise<void>
  createEnv: (values: {
    name: string
    color: string | undefined
  }) => Promise<void>
  deleteEnv: () => Promise<void>
  cloneEnv: (targetName: string) => Promise<void>
  revertDraft: () => void
}

function envToVarRows(environment: Environment): VarRow[] {
  const vars = environment.vars
  const disabledVars = environment.disabledVars ?? {}
  const secretVars = environment.secretVars ?? {}
  const rows: VarRow[] = []
  for (const [key, value] of Object.entries(vars)) {
    if (Object.hasOwn(secretVars, key)) continue
    rows.push({ id: nextVarId++, key, value, enabled: true, secret: false })
  }
  for (const [key, value] of Object.entries(disabledVars)) {
    if (Object.hasOwn(secretVars, key)) continue
    rows.push({ id: nextVarId++, key, value, enabled: false, secret: false })
  }
  for (const [key, status] of Object.entries(secretVars)) {
    rows.push({
      id: nextVarId++,
      key,
      value: Object.hasOwn(vars, key) ? vars[key]! : "",
      enabled: status !== "disabled",
      secret: true,
      originSecret: true,
      secretStatus: status,
    })
  }
  return rows
}

function varRowsToEnv(rows: VarRow[]): {
  vars: Record<string, string>
  disabledVars: Record<string, string>
  secretVars: Record<string, SecretStatus>
} {
  const vars: Record<string, string> = {}
  const disabledVars: Record<string, string> = {}
  const secretVars: Record<string, SecretStatus> = {}
  for (const row of rows) {
    if (row.key === "") continue
    if (row.secret) {
      setOwn(
        secretVars,
        row.key,
        row.enabled ? (row.secretStatus ?? "missing") : "disabled",
      )
      continue
    }
    if (row.enabled) {
      setOwn(vars, row.key, row.value)
    } else {
      setOwn(disabledVars, row.key, row.value)
    }
  }
  return { vars, disabledVars, secretVars }
}

function dirtyChanged(
  original: OriginalEnv | null,
  name: string,
  color: string | undefined,
  rows: VarRow[],
): boolean {
  if (!original) return name !== "" || rows.length > 0
  if (name !== original.name) return true
  if (color !== original.color) return true

  const { vars, disabledVars, secretVars } = varRowsToEnv(rows)
  const allKeys = new Set([
    ...Object.keys(original.vars),
    ...Object.keys(original.disabledVars),
    ...Object.keys(vars),
    ...Object.keys(disabledVars),
    ...Object.keys(original.secretVars),
    ...Object.keys(secretVars),
  ])
  for (const key of allKeys) {
    const origEnabled = Object.hasOwn(original.vars, key)
    const nowEnabled = Object.hasOwn(vars, key)
    const wasSecret = Object.hasOwn(original.secretVars, key)
    const isSecret = Object.hasOwn(secretVars, key)
    if (wasSecret !== isSecret) return true
    if (Object.hasOwn(secretVars, key)) {
      const originallyDisabled = original.secretVars[key] === "disabled"
      const nowDisabled = secretVars[key] === "disabled"
      if (originallyDisabled !== nowDisabled) return true
      const originalRow = original.varRows.find((row) => row.key === key)
      const nextRow = rows.find((row) => row.key === key)
      if (originalRow?.id !== nextRow?.id || nextRow?.valueChanged) return true
      continue
    }
    if (origEnabled !== nowEnabled) return true
    const origVal = origEnabled
      ? original.vars[key]
      : original.disabledVars[key]
    const nowVal = nowEnabled ? vars[key] : disabledVars[key]
    if (origVal !== nowVal) return true
  }
  return false
}

export function useEnvironmentEditor({
  environmentsDir,
  envNames,
  activeEnvName,
  onEnvsChanged,
  onActiveEnvChanged,
  onEnvDataChanged,
}: UseEnvironmentEditorProps): UseEnvironmentEditorResult {
  const [open, setOpen] = useState(false)
  const [localNames, setLocalNames] = useState(envNames)
  const [selectedEnvName, setSelectedEnvName] = useState<string | null>(null)
  const [draft, setDraft] = useState<EnvDraft | null>(null)
  const [original, setOriginal] = useState<OriginalEnv | null>(null)
  const [editState, setEditState] = useState<EnvEditState>(initialEditState())
  const [editKey, setEditKey] = useState("")
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealedRowId, setRevealedRowId] = useState<number | null>(null)
  const [clonePrompt, setClonePrompt] = useState<{
    source: string
    target: string
  } | null>(null)

  const draftRef = useRef(draft)
  draftRef.current = draft
  const originalRef = useRef(original)
  originalRef.current = original
  const selectedEnvNameRef = useRef(selectedEnvName)
  selectedEnvNameRef.current = selectedEnvName
  const loadedEnvNameRef = useRef<string | null>(null)
  const loadGenerationRef = useRef(0)
  const onEnvsChangedRef = useRef(onEnvsChanged)
  onEnvsChangedRef.current = onEnvsChanged
  const onEnvDataChangedRef = useRef(onEnvDataChanged)
  onEnvDataChangedRef.current = onEnvDataChanged
  const onActiveEnvChangedRef = useRef(onActiveEnvChanged)
  onActiveEnvChangedRef.current = onActiveEnvChanged
  const localNamesRef = useRef(localNames)
  localNamesRef.current = localNames
  const externalNamesRef = useRef(envNames)
  const editStateRef = useRef(editState)
  editStateRef.current = editState
  const editKeyRef = useRef(editKey)
  editKeyRef.current = editKey
  const editValueRef = useRef(editValue)
  editValueRef.current = editValue
  const createEnvPendingRef = useRef<Promise<void> | null>(null)

  const publishEnvNames = useCallback((names: string[]) => {
    localNamesRef.current = names
    setLocalNames(names)
    void Promise.resolve(onEnvsChangedRef.current?.(names)).catch(() => {})
  }, [])

  useEffect(() => {
    const previousNames = externalNamesRef.current
    if (
      previousNames.length === envNames.length &&
      previousNames.every((name, index) => name === envNames[index])
    ) {
      return
    }
    externalNamesRef.current = envNames
    localNamesRef.current = envNames
    setLocalNames(envNames)
  }, [envNames])

  const loadEnv = useCallback(
    async (name: string) => {
      const generation = ++loadGenerationRef.current
      try {
        const loaded = await env.loadEnvironment(environmentsDir, name)
        if (generation !== loadGenerationRef.current) return false
        const rows = envToVarRows(loaded)
        const nextDraft = {
          name: loaded.name,
          color: loaded.color,
          varRows: rows,
        }
        const nextOriginal = {
          name: loaded.name,
          color: loaded.color,
          vars: { ...loaded.vars },
          disabledVars: { ...(loaded.disabledVars ?? {}) },
          secretVars: { ...(loaded.secretVars ?? {}) },
          varRows: rows.map((row) => ({ ...row })),
        }
        draftRef.current = nextDraft
        setDraft(nextDraft)
        originalRef.current = nextOriginal
        setOriginal(nextOriginal)
        selectedEnvNameRef.current = name
        setSelectedEnvName(name)
        loadedEnvNameRef.current = name
        setEditState(initialEditState())
        setEditKey("")
        setEditValue("")
        setError(null)
        setRevealedRowId(null)
        return true
      } catch (e: unknown) {
        if (generation !== loadGenerationRef.current) return false
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        return false
      }
    },
    [environmentsDir],
  )

  const openEditor = useCallback(
    async (name?: string) => {
      setOpen(true)
      setError(null)
      draftRef.current = null
      originalRef.current = null
      setDraft(null)
      setOriginal(null)
      setEditState(initialEditState())
      setEditKey("")
      setEditValue("")

      if (name) {
        await loadEnv(name)
      } else {
        const blank = { name: "", color: undefined, varRows: [] as VarRow[] }
        draftRef.current = blank
        setDraft(blank)
        originalRef.current = null
        setOriginal(null)
        setSelectedEnvName(null)
      }
    },
    [activeEnvName, envNames, loadEnv],
  )

  const closeEditor = useCallback(() => {
    setOpen(false)
    draftRef.current = null
    originalRef.current = null
    setDraft(null)
    setOriginal(null)
    setSelectedEnvName(null)
    setEditState(initialEditState())
    setEditKey("")
    setEditValue("")
    setError(null)
    setSaving(false)
    setRevealedRowId(null)
  }, [])

  const selectEnv = useCallback(
    async (name: string) => {
      if (
        selectedEnvNameRef.current === name &&
        loadedEnvNameRef.current === name
      ) {
        loadGenerationRef.current++
        return true
      }
      return loadEnv(name)
    },
    [loadEnv],
  )

  const setName = useCallback((name: string) => {
    const prev = draftRef.current
    if (!prev) return
    const next = { ...prev, name }
    draftRef.current = next
    setDraft(next)
  }, [])

  const setColor = useCallback((color: string | undefined) => {
    const prev = draftRef.current
    if (!prev) return
    const next = { ...prev, color }
    draftRef.current = next
    setDraft(next)
  }, [])

  // -- Edit state machine --

  const enterBrowse = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "inactive") return prev
      const rows = draftRef.current?.varRows.length ?? 0
      if (rows === 0) {
        return {
          mode: "browsing" as const,
          row: -1,
          addingRow: true,
          editingRow: -1,
        }
      }
      return {
        mode: "browsing" as const,
        row: 0,
        addingRow: false,
        editingRow: -1,
      }
    })
  }, [])

  const exitBrowse = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return initialEditState()
    })
  }, [])

  const browseUp = useCallback(() => {
    setRevealedRowId(null)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      if (prev.addingRow) {
        const rows = draftRef.current?.varRows.length ?? 0
        return { ...prev, row: Math.max(0, rows - 1), addingRow: false }
      }
      if (prev.row <= 0) return prev
      return { ...prev, row: prev.row - 1 }
    })
  }, [])

  const browseDown = useCallback(() => {
    setRevealedRowId(null)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      const rows = draftRef.current?.varRows.length ?? 0
      if (prev.addingRow) return prev
      if (prev.row >= rows - 1) {
        return { ...prev, row: -1, addingRow: true }
      }
      return { ...prev, row: prev.row + 1 }
    })
  }, [])

  const browseFirst = useCallback(() => {
    setRevealedRowId(null)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      const rows = draftRef.current?.varRows.length ?? 0
      if (rows === 0) {
        return { ...prev, row: -1, addingRow: true }
      }
      return { ...prev, row: 0, addingRow: false }
    })
  }, [])

  const browseLast = useCallback(() => {
    setRevealedRowId(null)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return { ...prev, row: -1, addingRow: true }
    })
  }, [])

  const enterEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const currentDraft = draftRef.current
    if (state.addingRow) {
      setEditKey("")
      setEditValue("")
    } else {
      const row = currentDraft?.varRows[state.row]
      if (row?.secret && row.secretStatus === "process") return
      setEditKey(row?.key ?? "")
      setEditValue(row?.value ?? "")
    }
    setEditState({
      mode: "editing",
      row: state.row,
      addingRow: state.addingRow,
      subfield: "key",
      editingRow: state.addingRow ? -1 : state.row,
    })
  }, [])

  const commitEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "editing") return
    const prev = draftRef.current
    if (!prev) return
    const key = editKeyRef.current.trim()
    const value = editValueRef.current
    let rows = [...prev.varRows]

    if (state.addingRow) {
      if (key !== "") {
        rows = [
          ...rows,
          { id: nextVarId++, key, value, enabled: true, secret: false },
        ]
      }
    } else {
      if (key === "") {
        rows = rows.filter((_, i) => i !== state.editingRow)
      } else {
        rows = rows.map((r, i) => {
          if (i !== state.editingRow) return r
          const tracksSecretValue = r.secret || r.originSecret
          const originalRow = originalRef.current?.varRows.find(
            (candidate) => candidate.id === r.id,
          )
          return {
            ...r,
            key,
            value,
            valueChanged: tracksSecretValue
              ? value !== (originalRow?.value ?? r.value) || undefined
              : r.valueChanged,
          }
        })
      }
    }

    const next = { ...prev, varRows: rows }
    draftRef.current = next
    setDraft(next)
    setEditKey("")
    setEditValue("")
    setEditState({
      mode: "browsing",
      row: state.row,
      addingRow: state.addingRow && key !== "",
      editingRow: -1,
    })
  }, [])

  const activateVar = useCallback(
    (row: number, addingRow = false, subfield: "key" | "value" = "key") => {
      const targetId = addingRow
        ? undefined
        : draftRef.current?.varRows[row]?.id
      commitEdit()
      const resolvedRow = targetId
        ? (draftRef.current?.varRows.findIndex(
            (entry) => entry.id === targetId,
          ) ?? -1)
        : row
      if (!addingRow && resolvedRow < 0) return
      const currentRow = addingRow
        ? undefined
        : draftRef.current?.varRows[resolvedRow]
      if (currentRow?.secret && currentRow.secretStatus === "process") return
      setEditKey(currentRow?.key ?? "")
      setEditValue(currentRow?.value ?? "")
      setRevealedRowId(null)
      setEditState({
        mode: "editing",
        row: resolvedRow,
        addingRow,
        subfield,
        editingRow: addingRow ? -1 : resolvedRow,
      })
    },
    [commitEdit],
  )

  const cancelEdit = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "editing") return prev
      return {
        mode: "browsing" as const,
        row: prev.row,
        addingRow: prev.addingRow,
        editingRow: -1,
      }
    })
    setEditKey("")
    setEditValue("")
  }, [])

  const browseTab = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "editing") return prev
      const next: "key" | "value" = prev.subfield === "key" ? "value" : "key"
      return { ...prev, subfield: next }
    })
  }, [])

  const toggleVar = useCallback((index: number) => {
    const prev = draftRef.current
    if (!prev) return
    const rows = [...prev.varRows]
    if (index >= 0 && index < rows.length) {
      rows[index] = { ...rows[index]!, enabled: !rows[index]!.enabled }
      if (rows[index]!.secret) {
        rows[index] = {
          ...rows[index]!,
          secretStatus: rows[index]!.enabled
            ? rows[index]!.secretStatus === "disabled"
              ? "missing"
              : rows[index]!.secretStatus
            : "disabled",
        }
      }
    }
    const next = { ...prev, varRows: rows }
    draftRef.current = next
    setDraft(next)
  }, [])

  const toggleSecret = useCallback((index: number) => {
    const prev = draftRef.current
    const row = prev?.varRows[index]
    if (!prev || !row || !row.key) return
    const rows = prev.varRows.map((item, i) =>
      i === index
        ? {
            ...item,
            secret: !item.secret,
            originSecret: item.secret ? item.originSecret : false,
            secretStatus: item.secret
              ? item.secretStatus
              : item.originSecret && item.secretStatus
                ? item.secretStatus
                : item.enabled
                  ? ("missing" as const)
                  : ("disabled" as const),
          }
        : item,
    )
    const next = { ...prev, varRows: rows }
    draftRef.current = next
    setDraft(next)
    setRevealedRowId(null)
  }, [])

  const toggleReveal = useCallback((index: number) => {
    const row = draftRef.current?.varRows[index]
    if (!row?.secret || !row.value) return
    setRevealedRowId((current) => (current === row.id ? null : row.id))
  }, [])

  const remaskSecrets = useCallback(() => {
    setRevealedRowId(null)
  }, [])

  const revertVar = useCallback((index: number) => {
    const prev = draftRef.current
    if (!prev) return
    const next = {
      ...prev,
      varRows: prev.varRows.filter((_, i) => i !== index),
    }
    draftRef.current = next
    setDraft(next)
    setEditState((es) => {
      if (es.mode !== "browsing") return es
      const newRows = prev.varRows.length - 1
      if (newRows === 0) {
        return { mode: "browsing", row: -1, addingRow: true, editingRow: -1 }
      }
      if (es.row >= newRows) {
        return { ...es, row: newRows - 1, addingRow: false }
      }
      return es
    })
  }, [])

  const save = useCallback(async () => {
    const curDraft = draftRef.current
    const curOriginal = originalRef.current
    if (!curDraft) return
    if (!curDraft.name.trim()) {
      setError("Environment name is required")
      return
    }

    const oldName =
      curOriginal && curOriginal.name !== curDraft.name
        ? curOriginal.name
        : null
    if (
      (oldName || !curOriginal) &&
      localNamesRef.current.includes(curDraft.name)
    ) {
      setError(`An environment named "${curDraft.name}" already exists`)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const collectionDir = dirname(environmentsDir)
      const duplicate = curDraft.varRows.find(
        (row, index) =>
          row.key &&
          curDraft.varRows.findIndex(
            (candidate) => candidate.key === row.key,
          ) !== index,
      )
      if (duplicate) throw new Error(`Duplicate variable "${duplicate.key}"`)
      const invalid = curDraft.varRows.find(
        (row) =>
          row.key !== "" &&
          (row.key === "_color" || !isValidVariableName(row.key)),
      )
      if (invalid) throw new Error(`Invalid variable name "${invalid.key}"`)

      const originalById = new Map(
        (curOriginal?.varRows ?? []).map((row) => [row.id, row]),
      )

      const written: {
        environment: string
        key: string
        previous: string | null
      }[] = []
      const deleted: {
        environment: string
        key: string
        previous: string
      }[] = []
      const cleanup: { environment: string; key: string }[] = []
      try {
        for (const row of curDraft.varRows) {
          const before = originalById.get(row.id)
          if (row.secret) {
            const destinationChanged =
              !before?.secret ||
              before.key !== row.key ||
              curOriginal?.name !== curDraft.name
            if (
              destinationChanged &&
              before?.secretStatus === "process" &&
              !row.valueChanged
            ) {
              throw new Error(
                `Enter a replacement value before renaming process-sourced secret "${before.key}"`,
              )
            }
            let value: string | undefined
            if (row.valueChanged || !before?.secret) value = row.value
            else if (destinationChanged && before.secretStatus === "keychain") {
              value = before.value
            }
            if (value) {
              const previous = await getStoredSecret(
                collectionDir,
                curDraft.name,
                row.key,
              )
              await setStoredSecret(
                collectionDir,
                curDraft.name,
                row.key,
                value,
              )
              written.push({
                environment: curDraft.name,
                key: row.key,
                previous,
              })
              row.secretStatus = row.enabled
                ? Object.hasOwn(process.env, row.key)
                  ? "process"
                  : "keychain"
                : "disabled"
            } else if (Object.hasOwn(process.env, row.key)) {
              row.secretStatus = row.enabled ? "process" : "disabled"
            } else if (!before?.secret || row.valueChanged) {
              throw new Error(`Secret "${row.key}" must not be empty`)
            }
            if (
              before?.secret &&
              (before.key !== row.key || curOriginal?.name !== curDraft.name)
            ) {
              cleanup.push({
                environment: curOriginal!.name,
                key: before.key,
              })
            }
          } else if (before?.secret) {
            const canReuseStoredValue =
              before.secretStatus === "keychain" && row.value !== ""
            if (!row.valueChanged && !canReuseStoredValue) {
              throw new Error(
                `Enter a plaintext value before unmarking "${row.key}"`,
              )
            }
            cleanup.push({ environment: curOriginal!.name, key: before.key })
          }
        }

        for (const before of curOriginal?.varRows ?? []) {
          if (
            before.secret &&
            !curDraft.varRows.some((row) => row.id === before.id)
          ) {
            cleanup.push({ environment: curOriginal!.name, key: before.key })
          }
        }

        const { vars, disabledVars, secretVars } = varRowsToEnv(
          curDraft.varRows,
        )

        for (const target of cleanup) {
          const previous = await getStoredSecret(
            collectionDir,
            target.environment,
            target.key,
          )
          const removed = await deleteStoredSecret(
            collectionDir,
            target.environment,
            target.key,
          )
          if (removed && previous !== null) {
            deleted.push({ ...target, previous })
          }
        }

        await env.saveEnvironment(
          environmentsDir,
          {
            name: curDraft.name,
            vars,
            color: curDraft.color,
            disabledVars,
            secretVars,
          },
          { mode: oldName || !curOriginal ? "create" : "replace" },
        )

        if (oldName) {
          try {
            await env.deleteEnvironment(environmentsDir, oldName)
          } catch {
            // old file may already be gone
          }
        }

        const savedRows = curDraft.varRows.map((row) => ({
          ...row,
          originSecret: row.secret,
          secretStatus: row.secret ? row.secretStatus : undefined,
          valueChanged: false,
        }))
        const nextOriginal = {
          name: curDraft.name,
          color: curDraft.color,
          vars,
          disabledVars,
          secretVars,
          varRows: savedRows.map((row) => ({ ...row })),
        }
        const nextDraft = { ...curDraft, varRows: savedRows }
        draftRef.current = nextDraft
        setDraft(nextDraft)
        originalRef.current = nextOriginal
        setOriginal(nextOriginal)
      } catch (error) {
        const rollbackFailures: unknown[] = []
        for (const item of deleted.reverse()) {
          await attemptRollback(rollbackFailures, () =>
            setStoredSecret(
              collectionDir,
              item.environment,
              item.key,
              item.previous,
            ),
          )
        }
        for (const item of written.reverse()) {
          const previous = item.previous
          if (previous !== null) {
            await attemptRollback(rollbackFailures, () =>
              setStoredSecret(
                collectionDir,
                item.environment,
                item.key,
                previous,
              ),
            )
          } else {
            await attemptRollback(rollbackFailures, () =>
              deleteStoredSecret(collectionDir, item.environment, item.key),
            )
          }
        }
        throw withRollbackFailures(error, rollbackFailures)
      }

      setSelectedEnvName(curDraft.name)
      loadedEnvNameRef.current = curDraft.name
      const nextNames = oldName
        ? localNamesRef.current.map((name) =>
            name === oldName ? curDraft.name : name,
          )
        : localNamesRef.current.includes(curDraft.name)
          ? localNamesRef.current
          : [...localNamesRef.current, curDraft.name]
      publishEnvNames(nextNames)

      if (oldName && activeEnvName === oldName) {
        onActiveEnvChangedRef.current?.(curDraft.name)
      } else if (activeEnvName === curDraft.name) {
        onEnvDataChangedRef.current?.()
      }
      setRevealedRowId(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [environmentsDir, activeEnvName, publishEnvNames])

  const createEnv = useCallback(
    ({ name, color }: { name: string; color: string | undefined }) => {
      if (createEnvPendingRef.current) return createEnvPendingRef.current

      const trimmedName = name.trim()
      if (!trimmedName) {
        const message = "Environment name is required"
        setError(message)
        return Promise.reject(new Error(message))
      }
      if (localNamesRef.current.includes(trimmedName)) {
        const message = `An environment named "${trimmedName}" already exists`
        setError(message)
        return Promise.reject(new Error(message))
      }

      const pending = (async () => {
        setSaving(true)
        setError(null)
        try {
          await env.saveEnvironment(
            environmentsDir,
            {
              name: trimmedName,
              color,
              vars: {},
              disabledVars: {},
            },
            { mode: "create" },
          )

          const nextDraft = { name: trimmedName, color, varRows: [] }
          const nextOriginal = {
            name: trimmedName,
            color,
            vars: {},
            disabledVars: {},
            secretVars: {},
            varRows: [],
          }
          const nextNames = [...localNamesRef.current, trimmedName]
          draftRef.current = nextDraft
          originalRef.current = nextOriginal
          selectedEnvNameRef.current = trimmedName
          loadedEnvNameRef.current = trimmedName
          setDraft(nextDraft)
          setOriginal(nextOriginal)
          setSelectedEnvName(trimmedName)
          publishEnvNames(nextNames)
          setEditState(initialEditState())
          setEditKey("")
          setEditValue("")
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : String(e))
          throw e
        } finally {
          setSaving(false)
        }
      })()
      createEnvPendingRef.current = pending
      const clearPending = () => {
        if (createEnvPendingRef.current === pending) {
          createEnvPendingRef.current = null
        }
      }
      void pending.then(clearPending, clearPending)
      return pending
    },
    [environmentsDir, publishEnvNames],
  )

  const deleteEnvAction = useCallback(async () => {
    const name = selectedEnvNameRef.current
    if (!name) return
    setSaving(true)
    setError(null)
    const deleted: { key: string; previous: string }[] = []
    try {
      const current = await env.loadEnvironment(environmentsDir, name, {
        resolveSecrets: false,
      })
      for (const key of Object.keys(current.secretVars ?? {})) {
        const previous = await getStoredSecret(
          dirname(environmentsDir),
          name,
          key,
        )
        const removed = await deleteStoredSecret(
          dirname(environmentsDir),
          name,
          key,
        )
        if (removed && previous !== null) deleted.push({ key, previous })
      }
      await env.deleteEnvironment(environmentsDir, name)
      const remaining = localNamesRef.current.filter(
        (candidate) => candidate !== name,
      )
      publishEnvNames(remaining)
      if (activeEnvName === name) {
        onActiveEnvChangedRef.current?.(remaining[0] ?? "")
      }
      closeEditor()
    } catch (e: unknown) {
      const rollbackFailures: unknown[] = []
      for (const item of deleted.reverse()) {
        await attemptRollback(rollbackFailures, () =>
          setStoredSecret(
            dirname(environmentsDir),
            name,
            item.key,
            item.previous,
          ),
        )
      }
      setError(withRollbackFailures(e, rollbackFailures).message)
    } finally {
      setSaving(false)
    }
  }, [
    environmentsDir,
    activeEnvName,
    onActiveEnvChanged,
    closeEditor,
    publishEnvNames,
  ])

  const cloneEnvAction = useCallback(
    async (targetName: string) => {
      const name = selectedEnvNameRef.current
      if (!name) return
      setSaving(true)
      setError(null)
      try {
        const source = await env.loadEnvironment(environmentsDir, name, {
          resolveSecrets: false,
        })
        if (Object.keys(source.secretVars ?? {}).length > 0) {
          setClonePrompt({ source: name, target: targetName })
          return
        }
        await env.cloneEnvironment(environmentsDir, name, targetName)
        const updatedNames = [...localNamesRef.current, targetName]
        publishEnvNames(updatedNames)
        setSelectedEnvName(targetName)
        await loadEnv(targetName)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      } finally {
        setSaving(false)
      }
    },
    [environmentsDir, loadEnv, publishEnvNames],
  )

  const confirmClone = useCallback(
    async (copySecrets: boolean) => {
      const pending = clonePrompt
      if (!pending) return
      setClonePrompt(null)
      setSaving(true)
      setError(null)
      const copied: string[] = []
      let cloned = false
      try {
        const source = await env.loadEnvironment(
          environmentsDir,
          pending.source,
          { resolveSecrets: false },
        )
        await env.cloneEnvironment(
          environmentsDir,
          pending.source,
          pending.target,
        )
        cloned = true
        if (copySecrets) {
          for (const key of Object.keys(source.secretVars ?? {})) {
            if (Object.hasOwn(process.env, key)) continue
            const value = await getStoredSecret(
              dirname(environmentsDir),
              pending.source,
              key,
            )
            if (!value) continue
            await setStoredSecret(
              dirname(environmentsDir),
              pending.target,
              key,
              value,
            )
            copied.push(key)
          }
        }
        const updatedNames = [...localNamesRef.current, pending.target]
        publishEnvNames(updatedNames)
        setSelectedEnvName(pending.target)
        await loadEnv(pending.target)
      } catch (e: unknown) {
        const rollbackFailures: unknown[] = []
        for (const key of copied.reverse()) {
          await attemptRollback(rollbackFailures, () =>
            deleteStoredSecret(dirname(environmentsDir), pending.target, key),
          )
        }
        if (cloned) {
          await attemptRollback(rollbackFailures, () =>
            env.deleteEnvironment(environmentsDir, pending.target),
          )
        }
        setError(withRollbackFailures(e, rollbackFailures).message)
      } finally {
        setSaving(false)
      }
    },
    [clonePrompt, environmentsDir, loadEnv, publishEnvNames],
  )

  const revertDraft = useCallback(() => {
    draftRef.current = null
    originalRef.current = null
    selectedEnvNameRef.current = null
    setDraft(null)
    setOriginal(null)
    setSelectedEnvName(null)
    setEditState(initialEditState())
    setEditKey("")
    setEditValue("")
    setError(null)
    setRevealedRowId(null)
    setClonePrompt(null)
  }, [])

  const dirty = dirtyChanged(
    original,
    draft?.name ?? "",
    draft?.color,
    draft?.varRows ?? [],
  )

  return {
    open,
    envNames: localNames,
    selectedEnvName,
    draft,
    dirty,
    editState,
    editKey,
    editValue,
    setEditKey,
    setEditValue,
    saving,
    error,

    openEditor,
    closeEditor,
    selectEnv,
    setName,
    setColor,
    enterBrowse,
    exitBrowse,
    browseUp,
    browseDown,
    browseFirst,
    browseLast,
    enterEdit,
    activateVar,
    commitEdit,
    cancelEdit,
    browseTab,
    toggleVar,
    toggleSecret,
    toggleReveal,
    revealedRowId,
    clonePrompt,
    confirmClone,
    remaskSecrets,
    revertVar,
    save,
    createEnv,
    deleteEnv: deleteEnvAction,
    cloneEnv: cloneEnvAction,
    revertDraft,
  }
}
