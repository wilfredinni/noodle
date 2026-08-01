import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect, useRef, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import type {
  Collection,
  Folder,
  Request as NoodleRequest,
} from "../../src/schema"
import type { UseFolderDraftResult } from "../../src/hooks/useFolderDraft"
import { useCollectionFileActions } from "../../src/ui/useCollectionFileActions"
import { lang } from "../../src/lang"

const initialFolder: Folder = {
  id: "api",
  name: "API",
  path: "api",
  children: [],
}

const savedFolder: Folder = { ...initialFolder, name: "Saved API" }

const initialRequest: NoodleRequest = {
  id: "get-user",
  name: "Get User",
  method: "GET",
  url: "https://api.example.com/users/:id",
  timeout: 0,
  headers: {},
  params: [],
  pathParams: [{ name: "id", value: "42", enabled: true }],
}

function ActionsHarness({
  collectionDir,
  onSaveReady,
  onMarkSaved,
  selectedRequest = null,
  onEditReady,
  onEditSaved,
}: {
  collectionDir: string
  onSaveReady: (save: () => void) => void
  onMarkSaved: () => void
  selectedRequest?: NoodleRequest | null
  onEditReady?: (
    edit: (
      name: string,
      method: NoodleRequest["method"],
      url: string,
      folderPath?: string,
    ) => void,
  ) => void
  onEditSaved?: () => void
}) {
  const [collection, updateCollection] = useState<Collection | null>(null)
  const folderDraftRef = useRef<UseFolderDraftResult>({
    folderDraft: savedFolder,
    markSaved: onMarkSaved,
  } as never)
  const savingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actions = useCollectionFileActions({
    collectionDir,
    collection,
    updateCollection,
    selectedRequest,
    requestDraftRef: useRef({ moveRequestDraft: () => {} } as never),
    folderDraftRef,
    newRequestFolderRef: useRef(null),
    folderDeletePathRef: useRef(null),
    setCollectionReloadToken: () => onEditSaved?.(),
    setFocus: () => {},
    setSaveState: () => {},
    savingRef,
    clearSaveTimer: () => {},
    saveTimerRef,
    setSelectedId: () => {},
    expandFolder: () => {},
    setNewRequestVisible: () => {},
    setImportCurlVisible: () => {},
    setCloneRequestVisible: () => {},
    setNewFolderVisible: () => {},
    setEditRequestVisible: () => {},
    setRequestDeletePending: () => {},
    setFolderDeletePending: () => {},
    onCollectionBootstrapped: () => {},
  })

  useEffect(() => {
    updateCollection({ id: "collection", name: "Collection", items: [] })
  }, [updateCollection])

  useEffect(() => {
    onSaveReady(actions.handleFolderSave)
  }, [actions.handleFolderSave, onSaveReady])

  useEffect(() => {
    onEditReady?.(actions.handleEditRequestConfirm)
  }, [actions.handleEditRequestConfirm, onEditReady])

  return null
}

describe("useCollectionFileActions", () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })))
  })

  it("saves a folder after the collection loads", async () => {
    const collectionDir = await mkdtemp(join(tmpdir(), "noodle-actions-"))
    dirs.push(collectionDir)
    let save: (() => void) | undefined
    let markedSaved = 0
    const render = await testRender(
      <ActionsHarness
        collectionDir={collectionDir}
        onSaveReady={(handleSave) => (save = handleSave)}
        onMarkSaved={() => markedSaved++}
      />,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    await render.renderOnce()
    await act(async () => {
      await save?.()
    })

    expect(markedSaved).toBe(1)
    expect(
      await readFile(join(collectionDir, "api", "folder.yml"), "utf8"),
    ).toContain("name: Saved API")
  })

  it("synchronizes renamed path params when saving an edited URL", async () => {
    const collectionDir = await mkdtemp(join(tmpdir(), "noodle-actions-"))
    dirs.push(collectionDir)
    let edit:
      | ((name: string, method: NoodleRequest["method"], url: string) => void)
      | undefined
    let resolveSaved: (() => void) | undefined
    const saved = new Promise<void>((resolve) => {
      resolveSaved = resolve
    })
    const render = await testRender(
      <ActionsHarness
        collectionDir={collectionDir}
        onSaveReady={() => {}}
        onMarkSaved={() => {}}
        selectedRequest={initialRequest}
        onEditReady={(handleEdit) => (edit = handleEdit)}
        onEditSaved={() => resolveSaved?.()}
      />,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    await act(async () => {
      edit?.("Get User", "GET", "https://api.example.com/users/:userId")
    })
    await saved

    const request = lang.parseRequest(
      "get-user",
      await readFile(join(collectionDir, "get-user.yml"), "utf8"),
    )
    expect(request.url).toBe("https://api.example.com/users/:userId")
    expect(request.pathParams).toEqual([
      { name: "userId", value: "42", enabled: true },
    ])
  })
})
