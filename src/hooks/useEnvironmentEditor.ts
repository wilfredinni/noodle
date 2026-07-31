import { useCallback, useRef, useState } from "react"
import { env } from "../env"

let nextVarId = 1

export interface VarRow {
  id: number
  key: string
  value: string
  enabled: boolean
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

interface OriginalEnv {
  name: string
  color: string | undefined
  vars: Record<string, string>
  disabledVars: Record<string, string>
}

export interface UseEnvironmentEditorProps {
  environmentsDir: string
  envNames: string[]
  activeEnvName: string | undefined
  onEnvsChanged: () => void
  onActiveEnvChanged: (name: string) => void
  onEnvDataChanged?: () => void
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
  selectEnv: (name: string) => Promise<void>
  setName: (name: string) => void
  setColor: (color: string | undefined) => void
  enterBrowse: () => void
  exitBrowse: () => void
  browseUp: () => void
  browseDown: () => void
  browseFirst: () => void
  browseLast: () => void
  enterEdit: () => void
  activateVar: (row: number, addingRow?: boolean) => void
  commitEdit: () => void
  cancelEdit: () => void
  browseTab: () => void
  toggleVar: (index: number) => void
  revertVar: (index: number) => void
  save: () => Promise<void>
  deleteEnv: () => Promise<void>
  cloneEnv: (targetName: string) => Promise<void>
  revertDraft: () => void
}

function envToVarRows(
  vars: Record<string, string>,
  disabledVars: Record<string, string>,
): VarRow[] {
  const rows: VarRow[] = []
  for (const [key, value] of Object.entries(vars)) {
    rows.push({ id: nextVarId++, key, value, enabled: true })
  }
  for (const [key, value] of Object.entries(disabledVars)) {
    rows.push({ id: nextVarId++, key, value, enabled: false })
  }
  return rows
}

function varRowsToEnv(rows: VarRow[]): {
  vars: Record<string, string>
  disabledVars: Record<string, string>
} {
  const vars: Record<string, string> = {}
  const disabledVars: Record<string, string> = {}
  for (const row of rows) {
    if (row.key === "") continue
    if (row.enabled) {
      vars[row.key] = row.value
    } else {
      disabledVars[row.key] = row.value
    }
  }
  return { vars, disabledVars }
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

  const { vars, disabledVars } = varRowsToEnv(rows)
  const allKeys = new Set([
    ...Object.keys(original.vars),
    ...Object.keys(original.disabledVars),
    ...Object.keys(vars),
    ...Object.keys(disabledVars),
  ])
  for (const key of allKeys) {
    const origEnabled = key in original.vars
    const nowEnabled = key in vars
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

  const draftRef = useRef(draft)
  draftRef.current = draft
  const originalRef = useRef(original)
  originalRef.current = original
  const selectedEnvNameRef = useRef(selectedEnvName)
  selectedEnvNameRef.current = selectedEnvName
  const onEnvsChangedRef = useRef(onEnvsChanged)
  onEnvsChangedRef.current = onEnvsChanged
  const onEnvDataChangedRef = useRef(onEnvDataChanged)
  onEnvDataChangedRef.current = onEnvDataChanged
  const onActiveEnvChangedRef = useRef(onActiveEnvChanged)
  onActiveEnvChangedRef.current = onActiveEnvChanged
  const localNamesRef = useRef(localNames)
  localNamesRef.current = localNames
  const editStateRef = useRef(editState)
  editStateRef.current = editState
  const editKeyRef = useRef(editKey)
  editKeyRef.current = editKey
  const editValueRef = useRef(editValue)
  editValueRef.current = editValue

  const loadEnv = useCallback(
    async (name: string) => {
      try {
        const loaded = await env.loadEnvironment(environmentsDir, name)
        const rows = envToVarRows(loaded.vars, loaded.disabledVars ?? {})
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
        }
        draftRef.current = nextDraft
        setDraft(nextDraft)
        originalRef.current = nextOriginal
        setOriginal(nextOriginal)
        setSelectedEnvName(name)
        setEditState(initialEditState())
        setEditKey("")
        setEditValue("")
        setError(null)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
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
  }, [])

  const selectEnv = useCallback(
    async (name: string) => {
      setSelectedEnvName(name)
      await loadEnv(name)
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

  const activateVar = useCallback((row: number, addingRow = false) => {
    const currentRow = addingRow ? undefined : draftRef.current?.varRows[row]
    setEditKey(currentRow?.key ?? "")
    setEditValue(currentRow?.value ?? "")
    setEditState({
      mode: "editing",
      row,
      addingRow,
      subfield: "key",
      editingRow: addingRow ? -1 : row,
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
        rows = [...rows, { id: nextVarId++, key, value, enabled: true }]
      }
    } else {
      if (key === "") {
        rows = rows.filter((_, i) => i !== state.editingRow)
      } else {
        rows = rows.map((r, i) =>
          i === state.editingRow ? { ...r, key, value } : r,
        )
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
    }
    const next = { ...prev, varRows: rows }
    draftRef.current = next
    setDraft(next)
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
    if (oldName && localNamesRef.current.includes(curDraft.name)) {
      setError(`An environment named "${curDraft.name}" already exists`)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { vars, disabledVars } = varRowsToEnv(curDraft.varRows)

      await env.saveEnvironment(environmentsDir, {
        name: curDraft.name,
        vars,
        color: curDraft.color,
        disabledVars,
      })

      if (oldName) {
        try {
          await env.deleteEnvironment(environmentsDir, oldName)
        } catch {
          // old file may already be gone
        }
      }

      const nextOriginal = {
        name: curDraft.name,
        color: curDraft.color,
        vars,
        disabledVars,
      }
      originalRef.current = nextOriginal
      setOriginal(nextOriginal)
      setSelectedEnvName(curDraft.name)
      if (oldName) {
        setLocalNames((prev) =>
          prev.map((n) => (n === oldName ? curDraft.name : n)),
        )
      } else {
        setLocalNames((prev) => {
          if (prev.includes(curDraft.name)) return prev
          return [...prev, curDraft.name]
        })
      }

      onEnvsChangedRef.current?.()

      if (activeEnvName === curDraft.name || activeEnvName === oldName) {
        onActiveEnvChangedRef.current?.(curDraft.name)
        onEnvDataChangedRef.current?.()
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [environmentsDir, activeEnvName, onActiveEnvChanged])

  const deleteEnvAction = useCallback(async () => {
    const name = selectedEnvNameRef.current
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      await env.deleteEnvironment(environmentsDir, name)
      if (activeEnvName === name) {
        const remaining = localNames.filter((n) => n !== name)
        onActiveEnvChangedRef.current?.(remaining[0] ?? "")
      }
      setLocalNames((prev) => prev.filter((n) => n !== name))
      onEnvsChangedRef.current?.()
      closeEditor()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [
    environmentsDir,
    activeEnvName,
    onActiveEnvChanged,
    closeEditor,
    localNames,
  ])

  const cloneEnvAction = useCallback(
    async (targetName: string) => {
      const name = selectedEnvNameRef.current
      if (!name) return
      setSaving(true)
      setError(null)
      try {
        await env.cloneEnvironment(environmentsDir, name, targetName)
        const updatedNames = [...localNames, targetName]
        setLocalNames(updatedNames)
        onEnvsChangedRef.current?.()
        setSelectedEnvName(targetName)
        await loadEnv(targetName)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      } finally {
        setSaving(false)
      }
    },
    [environmentsDir, localNames, loadEnv],
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
    revertVar,
    save,
    deleteEnv: deleteEnvAction,
    cloneEnv: cloneEnvAction,
    revertDraft,
  }
}
