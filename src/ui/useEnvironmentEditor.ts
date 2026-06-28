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
}

export interface UseEnvironmentEditorResult {
  open: boolean
  envNames: string[]
  selectedEnvName: string | null
  draft: EnvDraft | null
  dirty: boolean
  selectedRowIndex: number
  editingField: "key" | "value" | null
  saving: boolean
  error: string | null

  openEditor: (name?: string) => Promise<void>
  closeEditor: () => void
  selectEnv: (name: string) => Promise<void>
  setName: (name: string) => void
  setColor: (color: string | undefined) => void
  selectRow: (index: number) => void
  editField: (field: "key" | "value" | null) => void
  updateVarKey: (index: number, key: string) => void
  updateVarValue: (index: number, value: string) => void
  toggleVar: (index: number) => void
  deleteVar: (index: number) => void
  addVar: () => void
  save: () => Promise<void>
  deleteEnv: () => Promise<void>
  cloneEnv: (targetName: string) => Promise<void>
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

function varRowsToEnv(
  rows: VarRow[],
): { vars: Record<string, string>; disabledVars: Record<string, string> } {
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
}: UseEnvironmentEditorProps): UseEnvironmentEditorResult {
  const [open, setOpen] = useState(false)
  const [selectedEnvName, setSelectedEnvName] = useState<string | null>(null)
  const [draft, setDraft] = useState<EnvDraft | null>(null)
  const [original, setOriginal] = useState<OriginalEnv | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1)
  const [editingField, setEditingField] = useState<"key" | "value" | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draftRef = useRef(draft)
  draftRef.current = draft
  const originalRef = useRef(original)
  originalRef.current = original
  const selectedEnvNameRef = useRef(selectedEnvName)
  selectedEnvNameRef.current = selectedEnvName

  const loadEnv = useCallback(
    async (name: string) => {
      try {
        const loaded = await env.loadEnvironment(environmentsDir, name)
        const rows = envToVarRows(loaded.vars, loaded.disabledVars ?? {})
        setDraft({
          name: loaded.name,
          color: loaded.color,
          varRows: rows,
        })
        setOriginal({
          name: loaded.name,
          color: loaded.color,
          vars: { ...loaded.vars },
          disabledVars: { ...(loaded.disabledVars ?? {}) },
        })
        setSelectedEnvName(name)
        setSelectedRowIndex(-1)
        setEditingField(null)
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
      setDraft(null)
      setOriginal(null)
      setSelectedRowIndex(-1)
      setEditingField(null)

      const target = name ?? activeEnvName ?? envNames[0]
      if (target) {
        await loadEnv(target)
      } else {
        setDraft({ name: "", color: undefined, varRows: [] })
        setOriginal(null)
        setSelectedEnvName(null)
        setSelectedRowIndex(-1)
      }
    },
    [activeEnvName, envNames, loadEnv],
  )

  const closeEditor = useCallback(() => {
    setOpen(false)
    setDraft(null)
    setOriginal(null)
    setSelectedEnvName(null)
    setSelectedRowIndex(-1)
    setEditingField(null)
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
    setDraft((prev) => (prev ? { ...prev, name } : prev))
  }, [])

  const setColor = useCallback((color: string | undefined) => {
    setDraft((prev) => (prev ? { ...prev, color } : prev))
  }, [])

  const selectRow = useCallback((index: number) => {
    setSelectedRowIndex(index)
    setEditingField(null)
  }, [])

  const editField = useCallback((field: "key" | "value" | null) => {
    setEditingField(field)
  }, [])

  const updateVarKey = useCallback((index: number, key: string) => {
    setDraft((prev) => {
      if (!prev) return prev
      const rows = [...prev.varRows]
      if (index >= 0 && index < rows.length) {
        rows[index] = { ...rows[index]!, key }
      }
      return { ...prev, varRows: rows }
    })
  }, [])

  const updateVarValue = useCallback((index: number, value: string) => {
    setDraft((prev) => {
      if (!prev) return prev
      const rows = [...prev.varRows]
      if (index >= 0 && index < rows.length) {
        rows[index] = { ...rows[index]!, value }
      }
      return { ...prev, varRows: rows }
    })
  }, [])

  const toggleVar = useCallback((index: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      const rows = [...prev.varRows]
      if (index >= 0 && index < rows.length) {
        rows[index] = { ...rows[index]!, enabled: !rows[index]!.enabled }
      }
      return { ...prev, varRows: rows }
    })
  }, [])

  const deleteVar = useCallback((index: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, varRows: prev.varRows.filter((_, i) => i !== index) }
    })
    setSelectedRowIndex((prev) => {
      if (prev > index) return prev - 1
      if (prev === index) return Math.max(0, index - 1)
      return prev
    })
  }, [])

  const addVar = useCallback(() => {
    const prev = draftRef.current
    if (!prev) return
    const newRow: VarRow = { id: nextVarId++, key: "", value: "", enabled: true }
    setDraft({ ...prev, varRows: [...prev.varRows, newRow] })
    setSelectedRowIndex(prev.varRows.length)
    setEditingField("key")
  }, [])

  const save = useCallback(async () => {
    const curDraft = draftRef.current
    const curOriginal = originalRef.current
    if (!curDraft) return
    if (!curDraft.name.trim()) {
      setError("Environment name is required")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { vars, disabledVars } = varRowsToEnv(curDraft.varRows)
      const oldName =
        curOriginal && curOriginal.name !== curDraft.name
          ? curOriginal.name
          : null

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

      setOriginal({
        name: curDraft.name,
        color: curDraft.color,
        vars,
        disabledVars,
      })
      setSelectedEnvName(curDraft.name)

      onEnvsChanged()
      if (
        activeEnvName === curDraft.name ||
        activeEnvName === oldName
      ) {
        onActiveEnvChanged(curDraft.name)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [environmentsDir, onEnvsChanged, activeEnvName, onActiveEnvChanged])

  const deleteEnvAction = useCallback(async () => {
    const name = selectedEnvNameRef.current
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      await env.deleteEnvironment(environmentsDir, name)
      if (activeEnvName === name) {
        const remaining = envNames.filter((n) => n !== name)
        onActiveEnvChanged(remaining[0] ?? "")
      }
      onEnvsChanged()
      closeEditor()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [environmentsDir, activeEnvName, envNames, onActiveEnvChanged, onEnvsChanged, closeEditor])

  const cloneEnvAction = useCallback(
    async (targetName: string) => {
      const name = selectedEnvNameRef.current
      if (!name) return
      setSaving(true)
      setError(null)
      try {
        await env.cloneEnvironment(environmentsDir, name, targetName)
        onEnvsChanged()
        await selectEnv(targetName)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      } finally {
        setSaving(false)
      }
    },
    [environmentsDir, onEnvsChanged, selectEnv],
  )

  const dirty = dirtyChanged(
    original,
    draft?.name ?? "",
    draft?.color,
    draft?.varRows ?? [],
  )

  return {
    open,
    envNames,
    selectedEnvName,
    draft,
    dirty,
    selectedRowIndex,
    editingField,
    saving,
    error,

    openEditor,
    closeEditor,
    selectEnv,
    setName,
    setColor,
    selectRow,
    editField,
    updateVarKey,
    updateVarValue,
    toggleVar,
    deleteVar,
    addVar,
    save,
    deleteEnv: deleteEnvAction,
    cloneEnv: cloneEnvAction,
  }
}
