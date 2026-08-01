import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { useEffect, useState } from "react"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import { useEditBrowse } from "../../src/hooks/useEditBrowse"
import { useCollectionSwitcher } from "../../src/ui/useCollectionSwitcher"
import { useReloadGuard } from "../../src/ui/useReloadGuard"
import type { Request } from "../../src/schema"

const request: Request = {
  id: "request",
  name: "Request",
  method: "GET",
  url: "https://example.com",
  headers: { "X-Test": { value: "original", enabled: true } },
  params: [],
  timeout: 0,
  followRedirects: true,
  maxRedirects: 5,
  auth: { type: "none" },
}

function ReloadGuardHarness({
  onResult,
}: {
  onResult: (result: { reloads: number; pending: boolean }) => void
}) {
  const draft = useRequestDraft(request)
  const [step, setStep] = useState(0)
  const [reloads, setReloads] = useState(0)
  const reload = useReloadGuard(draft.dirtyRequestIds.size > 0, () =>
    setReloads((count) => count + 1),
  )

  useEffect(() => {
    if (step === 0) {
      draft.setUrl("https://changed.example.com")
      setStep(1)
    } else if (step === 1 && draft.isDirty) {
      reload.requestReload()
      setStep(2)
    } else if (step === 2) {
      onResult({ reloads, pending: reload.reloadPending })
    }
  }, [draft, onResult, reload, reloads, step])

  return null
}

function InlineEditSwitchHarness({
  onResult,
}: {
  onResult: (result: { changes: number; pending: string | null }) => void
}) {
  const draft = useRequestDraft(request)
  const editor = useEditBrowse(draft.draft, draft)
  const [step, setStep] = useState(0)
  const [changes, setChanges] = useState(0)
  const switcher = useCollectionSwitcher({
    collectionDir: "/current",
    hasUnsavedChanges:
      draft.dirtyRequestIds.size > 0 || editor.editState.mode === "editing",
    onCollectionChange: () => setChanges((count) => count + 1),
  })

  useEffect(() => {
    if (step === 0) {
      editor.activateAt("headers", 0)
      setStep(1)
    } else if (step === 1 && editor.editState.mode === "editing") {
      editor.setEditValue("changed")
      setStep(2)
    } else if (step === 2 && editor.editValue === "changed") {
      switcher.requestCollectionSwitch("/next")
      setStep(3)
    } else if (step === 3) {
      onResult({
        changes,
        pending: switcher.collectionSwitchPending,
      })
    }
  }, [changes, editor, onResult, step, switcher])

  return null
}

describe("unsaved changes regressions", () => {
  it("warns before reloading a collection with unsaved drafts", async () => {
    let result = { reloads: 0, pending: false }
    const { renderOnce } = await testRender(
      <ReloadGuardHarness onResult={(next) => (result = next)} />,
      { width: 20, height: 5 },
    )

    for (let i = 0; i < 5; i++) await renderOnce()

    expect(result).toEqual({ reloads: 0, pending: true })
  })

  it("warns before switching collections with an uncommitted field edit", async () => {
    let result = { changes: 0, pending: null as string | null }
    const { renderOnce } = await testRender(
      <InlineEditSwitchHarness onResult={(next) => (result = next)} />,
      { width: 20, height: 5 },
    )

    for (let i = 0; i < 5; i++) await renderOnce()

    expect(result).toEqual({ changes: 0, pending: "/next" })
  })
})
