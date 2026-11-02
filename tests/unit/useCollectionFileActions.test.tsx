import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, useEffect, useRef, useState } from "react"
import { createTestRender } from "../testRender"
import type {
  Collection,
  Folder,
  Request as NoodleRequest,
} from "../../src/schema"
import type { UseFolderDraftResult } from "../../src/hooks/useFolderDraft"
import { useCollectionFileActions } from "../../src/ui/useCollectionFileActions"
import { lang } from "../../src/lang"
import * as toast from "../../src/ui/Toast"
import { createScriptDiagnostics } from "../../src/ui/editor/scriptDiagnostics"
import {
  formatCodeFields,
  type PreparedSave,
} from "../../src/ui/editor/codeFormatting"

const testRender = createTestRender()

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
  onNewReady,
  onCreateFailed,
  onDeleteReady,
  onFolderDeleteReady,
  collectionHooks,
  collectionLoaded = true,
  collectionSettingsPending = false,
  prepareFolder,
  draftFolder = savedFolder,
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
  onNewReady?: (
    create: (
      name: string,
      method: NoodleRequest["method"],
      url: string,
      folderPath?: string,
    ) => void,
  ) => void
  onCreateFailed?: (message: string) => void
  onDeleteReady?: (setFile: (id: string) => void, confirm: () => void) => void
  onFolderDeleteReady?: (
    setPath: (path: string) => void,
    confirm: () => void,
  ) => void
  collectionHooks?: Collection["hooks"]
  collectionLoaded?: boolean
  collectionSettingsPending?: boolean
  prepareFolder?: (folder: Folder) => Promise<PreparedSave<Folder>>
  draftFolder?: Folder
}) {
  const [collection, updateCollection] = useState<Collection | null>(null)
  const folderDraftRef = useRef<UseFolderDraftResult>({
    folderDraft: draftFolder,
    markSaved: onMarkSaved,
  } as never)
  const savingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestDeleteFileRef = useRef<string | null>(null)
  const folderDeletePathRef = useRef<string | null>(null)
  const actions = useCollectionFileActions({
    prepareFolder,
    collectionDir,
    collection,
    collectionHooks,
    collectionSettingsPending,
    updateCollection,
    selectedRequest,
    requestDraftRef: useRef({ moveRequestDraft: () => {} } as never),
    folderDraftRef,
    newRequestFolderRef: useRef(null),
    folderDeletePathRef,
    setCollectionReloadToken: () => onEditSaved?.(),
    setFocus: () => {},
    setSaveState: (state) => {
      if (typeof state !== "function" && state.kind === "error") {
        onCreateFailed?.(state.message)
      }
    },
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
    requestDeleteFileRef,
    setRequestDeletePending: () => {},
    setFolderDeletePending: () => {},
    onCollectionBootstrapped: () => {},
  })

  useEffect(() => {
    updateCollection(
      collectionLoaded
        ? {
            id: "collection",
            name: "Collection",
            items: [],
            hooks: collectionHooks,
          }
        : null,
    )
  }, [updateCollection, collectionHooks, collectionLoaded])

  useEffect(() => {
    onSaveReady(actions.handleFolderSave)
  }, [actions.handleFolderSave, onSaveReady])

  useEffect(() => {
    onEditReady?.(actions.handleEditRequestConfirm)
  }, [actions.handleEditRequestConfirm, onEditReady])

  useEffect(() => {
    onNewReady?.(actions.handleNewRequestConfirm)
  }, [actions.handleNewRequestConfirm, onNewReady])

  useEffect(() => {
    onDeleteReady?.((id) => {
      requestDeleteFileRef.current = id
    }, actions.handleRequestDeleteConfirm)
  }, [actions.handleRequestDeleteConfirm, onDeleteReady])

  useEffect(() => {
    onFolderDeleteReady?.((path) => {
      folderDeletePathRef.current = path
    }, actions.handleFolderDeleteConfirm)
  }, [actions.handleFolderDeleteConfirm, onFolderDeleteReady])

  return null
}

describe("useCollectionFileActions", () => {
  const dirs: string[] = []
  let notification: { mockRestore: () => void } | undefined

  afterEach(async () => {
    notification?.mockRestore()
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })))
  })

  it.each([
    "rename",
    "move",
    "delete",
    "teardown",
    "invalid-file",
    "folder",
    "pending",
    "memory-only",
    "disk-setup",
    "disk-teardown",
    "disk-rename",
    "disk-move",
    "disk-folder",
    "unreadable-settings",
  ] as const)(
    "rejects %s for a hook request without changing files",
    async (operation) => {
      const collectionDir = await mkdtemp(
        join(tmpdir(), "noodle-hook-actions-"),
      )
      dirs.push(collectionDir)
      await mkdir(join(collectionDir, "api"))
      const request = { ...initialRequest, id: "api/get-user" }
      const path = join(collectionDir, `${request.id}.yml`)
      const source =
        operation === "invalid-file"
          ? "invalid: ["
          : lang.serializeRequest(request)
      const hook =
        operation === "teardown" || operation === "disk-teardown"
          ? "teardown"
          : "setup"
      const settings =
        operation === "unreadable-settings"
          ? "invalid: ["
          : operation === "memory-only"
            ? "{}\n"
            : `hooks:\n  ${hook}: api/get-user\n`
      await writeFile(path, source)
      await writeFile(
        join(collectionDir, "settings.yml"),
        operation.startsWith("disk-") ? "{}\n" : settings,
      )
      let edit!: (
        name: string,
        method: NoodleRequest["method"],
        url: string,
        folderPath?: string,
      ) => void
      let deleteRequest!: () => void
      let deleteFolder!: () => void
      let setFile!: (id: string) => void
      let setFolder!: (path: string) => void
      const finished = Promise.withResolvers<string>()
      const notify = spyOn(toast, "showToast").mockImplementation((message) =>
        finished.resolve(message),
      )
      notification = notify
      const render = await testRender(
        <ActionsHarness
          collectionDir={collectionDir}
          collectionLoaded={operation !== "invalid-file"}
          collectionHooks={
            operation === "pending" ||
            operation.startsWith("disk-") ||
            operation === "unreadable-settings"
              ? undefined
              : { [hook]: request.id }
          }
          collectionSettingsPending={operation === "pending"}
          selectedRequest={request}
          onSaveReady={() => {}}
          onMarkSaved={() => {}}
          onEditReady={(handle) => (edit = handle)}
          onDeleteReady={(set, handle) => {
            setFile = set
            deleteRequest = handle
          }}
          onFolderDeleteReady={(set, handle) => {
            setFolder = set
            deleteFolder = handle
          }}
          onCreateFailed={finished.resolve}
          onEditSaved={() => finished.resolve("saved")}
        />,
        { width: 1, height: 1 },
      )
      await render.renderOnce()
      if (operation.startsWith("disk-"))
        await writeFile(join(collectionDir, "settings.yml"), settings)
      await act(async () => {
        if (operation === "rename" || operation === "disk-rename")
          edit("Renamed", "GET", request.url, "api")
        else if (operation === "move" || operation === "disk-move")
          edit("Get User", "GET", request.url, "other")
        else if (operation === "folder" || operation === "disk-folder") {
          setFolder("api")
          deleteFolder()
        } else {
          if (operation === "invalid-file") setFile(request.id)
          deleteRequest()
        }
        expect(await finished.promise).toContain(
          operation === "pending"
            ? "finish saving"
            : operation === "unreadable-settings"
              ? "Cannot read collection settings"
              : `${hook} hook`,
        )
        expect(notify).toHaveBeenCalledTimes(1)
      })
      expect(await readFile(path, "utf8")).toBe(source)
      expect(await readFile(join(collectionDir, "settings.yml"), "utf8")).toBe(
        settings,
      )
      expect(
        await Bun.file(join(collectionDir, "api/renamed.yml")).exists(),
      ).toBe(false)
      expect(
        await Bun.file(join(collectionDir, "other/get-user.yml")).exists(),
      ).toBe(false)
    },
  )

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

  it.each([false, true])(
    "saves folder scripts with formatter unavailable: %s",
    async (unavailable) => {
      const collectionDir = await mkdtemp(
        join(tmpdir(), "noodle-format-folder-"),
      )
      dirs.push(collectionDir)
      const service = createScriptDiagnostics()
      const formatter = {
        format: unavailable
          ? async () => {
              throw new Error("Semantic validation unavailable")
            }
          : service.format,
      }
      let save: (() => void) | undefined
      let markedSaved = 0
      try {
        await testRender(
          <ActionsHarness
            collectionDir={collectionDir}
            draftFolder={{
              ...savedFolder,
              scripts: { pre: "const x={a:1}", post: "./scripts/post.js" },
              tests: 'test("ok",()=>{})',
            }}
            prepareFolder={async (folder) =>
              formatCodeFields(folder, formatter)
            }
            onSaveReady={(handleSave) => (save = handleSave)}
            onMarkSaved={() => markedSaved++}
          />,
          { width: 1, height: 1 },
        )
        await act(async () => {
          await save?.()
        })
        expect(markedSaved).toBe(1)
        const yaml = await readFile(
          join(collectionDir, "api", "folder.yml"),
          "utf8",
        )
        expect(yaml).toContain(
          unavailable ? "const x={a:1}" : "const x = { a: 1 }",
        )
        expect(yaml).toContain(
          unavailable ? 'test("ok",()=>{})' : 'test("ok", () => { })',
        )
        expect(yaml).toContain("./scripts/post.js")
      } finally {
        service.dispose()
      }
    },
  )

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
        collectionHooks={{ setup: initialRequest.id }}
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

  it("creates a request with synchronized URL parameters in the selected folder", async () => {
    const collectionDir = await mkdtemp(join(tmpdir(), "noodle-actions-"))
    dirs.push(collectionDir)
    let create:
      | ((
          name: string,
          method: NoodleRequest["method"],
          url: string,
          folderPath?: string,
        ) => void)
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
        onNewReady={(handleCreate) => (create = handleCreate)}
        onEditSaved={() => resolveSaved?.()}
      />,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    await act(async () => {
      create?.(
        "Get Users",
        "GET",
        "https://api.example.com/users/:id?limit=10",
        "api",
      )
    })
    await saved

    const request = lang.parseRequest(
      "api/get-users",
      await readFile(join(collectionDir, "api", "get-users.yml"), "utf8"),
    )
    expect(request.id).toBe("api/get-users")
    expect(request.url).toBe("https://api.example.com/users/:id")
    expect(request.params).toEqual([
      { name: "limit", value: "10", enabled: true },
    ])
    expect(request.pathParams).toEqual([
      { name: "id", value: "", enabled: true },
    ])
  })

  it("does not overwrite a request with the same slug in the selected folder", async () => {
    const collectionDir = await mkdtemp(join(tmpdir(), "noodle-actions-"))
    dirs.push(collectionDir)
    await mkdir(join(collectionDir, "api"))
    await writeFile(
      join(collectionDir, "api", "get-users.yml"),
      lang.serializeRequest({
        ...initialRequest,
        id: "api/get-users",
        name: "Existing request",
      }),
    )
    let create:
      | ((
          name: string,
          method: NoodleRequest["method"],
          url: string,
          folderPath?: string,
        ) => void)
      | undefined
    let resolveFailed: (() => void) | undefined
    const failed = new Promise<void>((resolve) => {
      resolveFailed = resolve
    })
    const render = await testRender(
      <ActionsHarness
        collectionDir={collectionDir}
        onSaveReady={() => {}}
        onMarkSaved={() => {}}
        onNewReady={(handleCreate) => (create = handleCreate)}
        onCreateFailed={() => resolveFailed?.()}
      />,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    await act(async () => {
      create?.("Get Users", "POST", "https://api.example.com/new", "api")
    })
    await failed

    const request = lang.parseRequest(
      "api/get-users",
      await readFile(join(collectionDir, "api", "get-users.yml"), "utf8"),
    )
    expect(request.name).toBe("Existing request")
    expect(request.method).toBe("GET")
  })

  it.each(["broken", "settings"])("repairs invalid %s", async (id) => {
    const collectionDir = await mkdtemp(join(tmpdir(), "noodle-actions-"))
    dirs.push(collectionDir)
    await writeFile(join(collectionDir, `${id}.yml`), "collection_id: nope\n")

    let setDeleteFile: ((id: string) => void) | undefined
    let confirmDelete: (() => void) | undefined
    let resolveDeleted: (() => void) | undefined
    const deleted = new Promise<void>((resolve) => {
      resolveDeleted = resolve
    })
    const render = await testRender(
      <ActionsHarness
        collectionDir={collectionDir}
        collectionHooks={{ teardown: "unrelated" }}
        onSaveReady={() => {}}
        onMarkSaved={() => {}}
        onDeleteReady={(setFile, confirm) => {
          setDeleteFile = setFile
          confirmDelete = confirm
        }}
        onEditSaved={() => resolveDeleted?.()}
      />,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    await render.renderOnce()
    await act(async () => {
      setDeleteFile?.(id)
      confirmDelete?.()
    })
    await deleted

    await expect(readFile(join(collectionDir, `${id}.yml`))).rejects.toThrow()
  })
})
