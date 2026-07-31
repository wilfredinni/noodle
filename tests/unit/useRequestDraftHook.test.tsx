import { describe, expect, it } from "bun:test"
import { useEffect, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import type { Request } from "../../src/schema"

const request: Request = {
  id: "r1",
  name: "Test",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
  followRedirects: true,
  maxRedirects: 5,
  auth: { type: "none" },
}

function Harness({ onMethod }: { onMethod: (method: string) => void }) {
  const draft = useRequestDraft(request)

  useEffect(() => {
    draft.setMethod("POST")
  }, [draft.setMethod])

  useEffect(() => {
    onMethod(draft.draft?.method ?? "")
  }, [draft.draft?.method, onMethod])

  return null
}

function SaveRaceHarness({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  const draft = useRequestDraft(request)
  const [step, setStep] = useState(0)
  const savedRequest = { ...request, url: "https://saved.example.com" }

  useEffect(() => {
    if (step === 0) {
      draft.setUrl(savedRequest.url)
      setStep(1)
    } else if (step === 1 && draft.draft?.url === savedRequest.url) {
      draft.setUrl("https://later.example.com")
      setStep(2)
    } else if (step === 2 && draft.draft?.url === "https://later.example.com") {
      draft.markSaved(savedRequest)
      setStep(3)
    } else if (step === 3) {
      onDirty(draft.isDirty)
    }
  }, [draft, onDirty, savedRequest, step])

  return null
}

function MoveDraftHarness({
  onDirtyIds,
}: {
  onDirtyIds: (ids: Set<string>) => void
}) {
  const draft = useRequestDraft(request)
  const [step, setStep] = useState(0)
  const movedRequest = { ...request, id: "folder/r2", name: "Moved" }

  useEffect(() => {
    if (step === 0) {
      draft.setBody("unsaved body")
      setStep(1)
    } else if (step === 1 && draft.draft?.body === "unsaved body") {
      draft.moveRequestDraft(request.id, movedRequest)
      setStep(2)
    } else if (step === 2) {
      onDirtyIds(draft.dirtyRequestIds)
    }
  }, [draft, movedRequest, onDirtyIds, step])

  return null
}

describe("useRequestDraft setMethod", () => {
  it("exposes method updates through hook result", async () => {
    let method = ""
    const { renderOnce } = await testRender(
      <Harness onMethod={(next) => (method = next)} />,
      { width: 20, height: 5 },
    )

    await renderOnce()
    await renderOnce()

    expect(method).toBe("POST")
  })

  it("keeps edits made during a pending save dirty", async () => {
    let isDirty = false
    const { renderOnce } = await testRender(
      <SaveRaceHarness onDirty={(dirty) => (isDirty = dirty)} />,
      { width: 20, height: 5 },
    )

    await renderOnce()
    await renderOnce()
    await renderOnce()
    await renderOnce()
    await renderOnce()

    expect(isDirty).toBe(true)
  })

  it("moves unsaved state to a renamed request ID", async () => {
    let dirtyIds = new Set<string>()
    const { renderOnce } = await testRender(
      <MoveDraftHarness onDirtyIds={(ids) => (dirtyIds = ids)} />,
      { width: 20, height: 5 },
    )

    await renderOnce()
    await renderOnce()
    await renderOnce()
    await renderOnce()

    expect(dirtyIds).toEqual(new Set(["folder/r2"]))
  })
})
