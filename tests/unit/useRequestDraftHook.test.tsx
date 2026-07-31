import { describe, expect, it } from "bun:test"
import { useEffect, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import { useFolderDraft } from "../../src/hooks/useFolderDraft"
import type { Auth, Folder, Request } from "../../src/schema"

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

const authRequest: Request = {
  ...request,
  id: "auth-race",
  auth: { type: "basic", user: "saved-user", pass: "saved-pass" },
}

const savedAuthRequest: Request = {
  ...authRequest,
  auth: { type: "bearer", token: "saved-token" },
}

const folder: Folder = {
  id: "folder-auth-race",
  name: "Folder auth race",
  path: "folder-auth-race",
  children: [],
  overrides: {
    auth: { type: "basic", user: "saved-user", pass: "saved-pass" },
  },
}

const savedFolder: Folder = {
  ...folder,
  overrides: { auth: { type: "bearer", token: "saved-token" } },
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
  const movedRequest = {
    ...request,
    id: "folder/r2",
    name: "Moved",
    method: "DELETE" as const,
  }

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

function RequestAuthSaveRaceHarness({
  onAuth,
}: {
  onAuth: (auth: Auth | undefined) => void
}) {
  const draft = useRequestDraft(authRequest)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const auth = draft.draft?.auth
    if (step === 0) {
      draft.setAuthType("bearer")
      setStep(1)
    } else if (step === 1 && auth?.type === "bearer") {
      draft.setAuthField("bearer", "token", "saved-token")
      setStep(2)
    } else if (
      step === 2 &&
      auth?.type === "bearer" &&
      auth.token === "saved-token"
    ) {
      draft.setAuthField("bearer", "token", "later-token")
      setStep(3)
    } else if (
      step === 3 &&
      auth?.type === "bearer" &&
      auth.token === "later-token"
    ) {
      draft.markSaved(savedAuthRequest)
      setStep(4)
    } else if (step === 4) {
      draft.setAuthType("basic")
      setStep(5)
    } else if (step === 5) {
      onAuth(draft.draft?.auth)
    }
  }, [draft, onAuth, step])

  return null
}

function FolderAuthSaveRaceHarness({
  onAuth,
}: {
  onAuth: (auth: Auth | undefined) => void
}) {
  const draft = useFolderDraft(folder)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step === 0) {
      draft.setAuthType("bearer")
      setStep(1)
    } else if (
      step === 1 &&
      draft.folderDraft?.overrides?.auth?.type === "bearer"
    ) {
      draft.setAuthField("bearer", "token", "saved-token")
      setStep(2)
    } else if (
      step === 2 &&
      draft.folderDraft?.overrides?.auth?.type === "bearer" &&
      draft.folderDraft.overrides.auth.token === "saved-token"
    ) {
      draft.setAuthField("bearer", "token", "later-token")
      setStep(3)
    } else if (
      step === 3 &&
      draft.folderDraft?.overrides?.auth?.type === "bearer" &&
      draft.folderDraft.overrides.auth.token === "later-token"
    ) {
      draft.markSaved(savedFolder)
      setStep(4)
    } else if (step === 4) {
      draft.setAuthType("basic")
      setStep(5)
    } else if (step === 5) {
      onAuth(draft.folderDraft?.overrides?.auth)
    }
  }, [draft, onAuth, step])

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

  it("preserves unsaved method and URL when a request is renamed", async () => {
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

  it("keeps cached request auth after a concurrent save edit", async () => {
    let restoredAuth: Auth | undefined
    const { renderOnce } = await testRender(
      <RequestAuthSaveRaceHarness onAuth={(auth) => (restoredAuth = auth)} />,
      { width: 20, height: 5 },
    )

    for (let i = 0; i < 8; i++) await renderOnce()

    expect(restoredAuth).toEqual({
      type: "basic",
      user: "saved-user",
      pass: "saved-pass",
    })
  })

  it("keeps cached folder auth after a concurrent save edit", async () => {
    let restoredAuth: Auth | undefined
    const { renderOnce } = await testRender(
      <FolderAuthSaveRaceHarness onAuth={(auth) => (restoredAuth = auth)} />,
      { width: 20, height: 5 },
    )

    for (let i = 0; i < 8; i++) await renderOnce()

    expect(restoredAuth).toEqual({
      type: "basic",
      user: "saved-user",
      pass: "saved-pass",
    })
  })
})
