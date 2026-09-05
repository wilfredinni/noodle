import { describe, expect, it } from "bun:test"
import { act, useEffect, useState } from "react"
import { createTestRender } from "../testRender"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import {
  useEditBrowse,
  type UseEditBrowseResult,
} from "../../src/hooks/useEditBrowse"
import type { Request } from "../../src/schema"
import type { FieldKind } from "../../src/ui/editMode"

const testRender = createTestRender()
const request: Request = {
  id: "authoring",
  name: "Authoring",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
}

describe("useEditBrowse authored rows", () => {
  it("commits a path value when its read-only key buffer is cleared", async () => {
    const result: { value?: Request["pathParams"] } = {}
    let committed: boolean | undefined
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        url: "https://example.com/users/:id",
        pathParams: [{ name: "id", value: "42", enabled: true }],
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("pathParams", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("")
          editor.setEditValue("99")
          setStep(3)
        } else if (
          step === 3 &&
          editor.editKey === "" &&
          editor.editValue === "99"
        ) {
          committed = editor.commitEdit()
          setStep(4)
        } else if (step === 4 && editor.editState.mode === "browsing") {
          result.value = draft.draft?.pathParams
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(committed).toBe(true)
    expect(result.value).toEqual([{ name: "id", value: "99", enabled: true }])
  })

  it("adds a structured assertion and parses its expected value", async () => {
    const result: { value?: Request["assertions"] } = {}
    function Harness() {
      const draft = useRequestDraft(request)
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("assertions")
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("status")
          editor.setEditOperator("equals")
          editor.setEditValue("200")
          setStep(3)
        } else if (
          step === 3 &&
          editor.editKey === "status" &&
          editor.editValue === "200"
        ) {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4 && draft.draft?.assertions) {
          result.value = draft.draft.assertions
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual([
      { expression: "status", operator: "equals", value: 200 },
    ])
  })

  it("deletes an assertion when its expression is cleared", async () => {
    const result: { value?: Request["assertions"] | null } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        assertions: [{ expression: "status", operator: "equals", value: 200 }],
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("assertions", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("")
          setStep(3)
        } else if (step === 3 && editor.editKey === "") {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4) {
          result.value = draft.draft?.assertions ?? null
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && result.value === undefined; i++) {
      await render.renderOnce()
    }
    expect(result.value).toBeNull()
  })

  it("does not delete an assertion from the add row", async () => {
    const assertion = { expression: "status", operator: "exists" } as const
    const result: { value?: Request["assertions"] } = {}
    function Harness() {
      const draft = useRequestDraft({ ...request, assertions: [assertion] })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("assertions")
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.browseLast()
          setStep(2)
        } else if (step === 2 && editor.editState.cursor.addingRow) {
          editor.revertField()
          result.value = draft.draft?.assertions
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 5 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual([assertion])
  })

  it("commits a blank assertion add row as a no-op", async () => {
    const assertion = { expression: "status", operator: "exists" } as const
    const result: { value?: Request["assertions"] } = {}
    function Harness() {
      const draft = useRequestDraft({ ...request, assertions: [assertion] })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("assertions")
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.browseLast()
          setStep(2)
        } else if (step === 2 && editor.editState.cursor.addingRow) {
          editor.enterEdit()
          setStep(3)
        } else if (step === 3 && editor.editState.mode === "editing") {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4 && editor.editState.mode === "browsing") {
          result.value = draft.draft?.assertions
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual([assertion])
  })

  it("keeps invalid capture variable edits active", async () => {
    const result: { value?: { mode: string; error: string | null } } = {}
    let committed: boolean | undefined
    function Harness() {
      const draft = useRequestDraft(request)
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("captures", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("bad-name")
          editor.setEditValue("body.token")
          setStep(3)
        } else if (step === 3 && editor.editKey === "bad-name") {
          committed = editor.commitEdit()
          setStep(4)
        } else if (step === 4 && editor.editError) {
          result.value = {
            mode: editor.editState.mode,
            error: editor.editError,
          }
        }
      }, [editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual({
      mode: "editing",
      error: "Invalid variable name",
    })
    expect(committed).toBe(false)
  })

  it("adds captures from the shared add row", async () => {
    const result: { value?: Request["captures"] } = {}
    function Harness() {
      const draft = useRequestDraft(request)
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("captures")
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("token")
          editor.setEditValue("body.token")
          editor.setEditCapturePersistence("secret")
          setStep(3)
        } else if (
          step === 3 &&
          editor.editKey === "token" &&
          editor.editValue === "body.token"
        ) {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4 && draft.draft?.captures) {
          result.value = draft.draft.captures
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual({
      token: { value: "body.token", enabled: true, persist: "secret" },
    })
  })

  it("deletes a capture when its key is cleared", async () => {
    const result: { value?: Request["captures"] | null } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        captures: { token: { value: "body.token", enabled: true } },
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("captures", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("")
          setStep(3)
        } else if (step === 3 && editor.editKey === "") {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4) {
          result.value = draft.draft?.captures ?? null
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && result.value === undefined; i++) {
      await render.renderOnce()
    }
    expect(result.value).toBeNull()
  })

  it("does not delete the last capture from the add row", async () => {
    const result: { value?: Request["captures"] } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        captures: { token: { value: "body.token", enabled: true } },
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("captures")
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.browseLast()
          setStep(2)
        } else if (step === 2 && editor.editState.cursor.addingRow) {
          editor.revertField()
          result.value = draft.draft?.captures
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 5 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual({
      token: { value: "body.token", enabled: true },
    })
  })

  it("keeps disabled captures disabled while editing", async () => {
    const result: { value?: Request["captures"] } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        captures: {
          token: {
            value: "body.token",
            enabled: false,
            persist: "environment",
          },
        },
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("captures", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditValue("body.other")
          setStep(3)
        } else if (step === 3 && editor.editValue === "body.other") {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4) {
          result.value = draft.draft?.captures
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual({
      token: {
        value: "body.other",
        enabled: false,
        persist: "environment",
      },
    })
  })

  it("keeps disabled assertions disabled while editing", async () => {
    const result: { value?: Request["assertions"] } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        assertions: [
          {
            expression: "status",
            operator: "equals",
            value: 200,
            enabled: false,
          },
        ],
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("assertions", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditValue("201")
          setStep(3)
        } else if (step === 3 && editor.editValue === "201") {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4) {
          result.value = draft.draft?.assertions
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual([
      {
        expression: "status",
        operator: "equals",
        value: 201,
        enabled: false,
      },
    ])
  })

  it("routes existing and new tag rows to the overlay", async () => {
    const opened: { index: number; value: string }[] = []
    let finalMode: string | undefined
    function Harness() {
      const draft = useRequestDraft({ ...request, tags: ["smoke"] })
      const editor = useEditBrowse(draft.draft, draft, {
        onTagEdit: (index, value) => opened.push({ index, value }),
      })
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("settings", 5)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2) {
          editor.activateAt("settings", 6)
          setStep(3)
        } else if (step === 3) {
          finalMode = editor.editState.mode
        }
      }, [editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 6 && finalMode === undefined; i++) {
      await render.renderOnce()
    }
    expect(opened).toEqual([
      { index: 0, value: "smoke" },
      { index: 1, value: "" },
    ])
    expect(finalMode).toBe("browsing")
  })
})

function TabNavigationHarness({
  initialRequest,
  initialTab = "settings",
  optionalTabMenuEnabled = true,
  onEditor,
  onTab,
  onTabChange,
}: {
  initialRequest: Request
  initialTab?: FieldKind
  optionalTabMenuEnabled?: boolean
  onEditor: (editor: UseEditBrowseResult) => void
  onTab?: (tab: FieldKind, restoreTab: (tab: FieldKind) => void) => void
  onTabChange?: (tab: FieldKind) => void
}) {
  const draft = useRequestDraft(initialRequest)
  const [tab, setTab] = useState<FieldKind>(initialTab)
  const editor = useEditBrowse(draft.draft, draft, {
    initialTab: tab,
    onTabChange: (value) => {
      onTabChange?.(value)
      setTab(value)
    },
    optionalTabMenuEnabled,
  })
  onEditor(editor)
  onTab?.(tab, setTab)
  return null
}

describe("useEditBrowse optional-tab menu navigation", () => {
  it("does not restore empty optional tabs across sessions", async () => {
    for (const field of ["assertions", "captures"] as const) {
      let editor: UseEditBrowseResult | undefined
      let persistedTab: FieldKind | undefined
      const changes: FieldKind[] = []
      const render = await testRender(
        <TabNavigationHarness
          initialRequest={request}
          initialTab={field}
          onEditor={(value) => (editor = value)}
          onTab={(value) => (persistedTab = value)}
          onTabChange={(value) => changes.push(value)}
        />,
        { width: 20, height: 4 },
      )
      await render.renderOnce()
      await render.renderOnce()

      expect(editor?.activeTab).toBe("headers")
      expect(persistedTab).toBe("headers")
      expect(changes).toEqual(["headers"])
    }
  })

  it("notifies once when an empty optional preference loads after mount", async () => {
    let editor: UseEditBrowseResult | undefined
    let persistedTab: FieldKind | undefined
    let restoreTab: (tab: FieldKind) => void
    const changes: FieldKind[] = []
    const render = await testRender(
      <TabNavigationHarness
        initialRequest={request}
        initialTab="headers"
        onEditor={(value) => (editor = value)}
        onTab={(value, restore) => {
          persistedTab = value
          restoreTab = restore
        }}
        onTabChange={(value) => changes.push(value)}
      />,
      { width: 20, height: 4 },
    )
    await render.renderOnce()
    expect(changes).toEqual([])

    for (const field of ["assertions", "captures"] as const) {
      changes.length = 0
      act(() => restoreTab(field))
      await render.renderOnce()
      await render.renderOnce()

      expect(editor?.activeTab).toBe("headers")
      expect(persistedTab).toBe("headers")
      expect(changes).toEqual(["headers"])
    }
  })

  it("restores optional tabs that contain disabled declarations", async () => {
    const cases: Array<[FieldKind, Request]> = [
      [
        "assertions",
        {
          ...request,
          assertions: [
            { expression: "status", operator: "exists", enabled: false },
          ],
        },
      ],
      [
        "captures",
        {
          ...request,
          captures: { token: { value: "body.token", enabled: false } },
        },
      ],
    ]
    for (const [field, initialRequest] of cases) {
      let editor: UseEditBrowseResult | undefined
      let persistedTab: FieldKind | undefined
      const render = await testRender(
        <TabNavigationHarness
          initialRequest={initialRequest}
          initialTab={field}
          onEditor={(value) => (editor = value)}
          onTab={(value) => (persistedTab = value)}
        />,
        { width: 20, height: 4 },
      )
      await render.renderOnce()

      expect(editor?.activeTab).toBe(field)
      expect(persistedTab).toBe(field)
    }
  })

  it("keeps explicitly revealed empty tabs for the current session", async () => {
    let editor: UseEditBrowseResult | undefined
    let persistedTab: FieldKind | undefined
    const render = await testRender(
      <TabNavigationHarness
        initialRequest={request}
        onEditor={(value) => (editor = value)}
        onTab={(value) => (persistedTab = value)}
      />,
      { width: 20, height: 4 },
    )
    await render.renderOnce()

    act(() => editor!.revealOptionalTab("assertions"))
    act(() => editor!.enterBrowseAt("assertions"))
    await render.renderOnce()
    act(() => editor!.exitBrowse())
    await render.renderOnce()
    await render.renderOnce()

    expect(editor?.activeTab).toBe("assertions")
    expect(editor?.revealedOptionalTabs).toContain("assertions")
    expect(persistedTab).toBe("assertions")
  })

  it("cycles Settings → + → Headers and Headers → + → Settings", async () => {
    let editor: UseEditBrowseResult | undefined
    const render = await testRender(
      <TabNavigationHarness
        initialRequest={request}
        onEditor={(value) => (editor = value)}
      />,
      { width: 20, height: 4 },
    )
    await render.renderOnce()

    expect(editor?.activeTab).toBe("settings")
    expect(editor?.optionalTabMenuVisible).toBe(true)

    act(() => editor!.cycleInactiveTab(1))
    await render.renderOnce()
    expect(editor?.activeTab).toBe("settings")
    expect(editor?.optionalTabMenuActive).toBe(true)

    act(() => editor!.cycleInactiveTab(1))
    await render.renderOnce()
    await render.renderOnce()
    expect(editor?.activeTab).toBe("headers")
    expect(editor?.optionalTabMenuActive).toBe(false)

    act(() => editor!.cycleInactiveTab(-1))
    await render.renderOnce()
    expect(editor?.activeTab).toBe("headers")
    expect(editor?.optionalTabMenuActive).toBe(true)

    act(() => editor!.cycleInactiveTab(-1))
    await render.renderOnce()
    await render.renderOnce()
    expect(editor?.activeTab).toBe("settings")
    expect(editor?.optionalTabMenuActive).toBe(false)
  })

  it("reaches + from browse mode without changing the active tab", async () => {
    let editor: UseEditBrowseResult | undefined
    const render = await testRender(
      <TabNavigationHarness
        initialRequest={request}
        onEditor={(value) => (editor = value)}
      />,
      { width: 20, height: 4 },
    )
    await render.renderOnce()

    act(() => editor!.enterBrowseAt("settings"))
    await render.renderOnce()
    expect(editor?.editState.mode).toBe("browsing")

    act(() => editor!.browseRight())
    await render.renderOnce()
    expect(editor?.activeTab).toBe("settings")
    expect(editor?.optionalTabMenuActive).toBe(true)
    expect(editor?.editState.mode).toBe("inactive")

    act(() => editor!.enterBrowseAt("settings"))
    await render.renderOnce()
    act(() => editor!.setOptionalTabMenuActive(true))
    await render.renderOnce()
    expect(editor?.activeTab).toBe("settings")
    expect(editor?.optionalTabMenuActive).toBe(true)
    expect(editor?.editState.mode).toBe("inactive")
  })

  it("keeps + reachable when both optional tabs are visible", async () => {
    let editor: UseEditBrowseResult | undefined
    const render = await testRender(
      <TabNavigationHarness
        initialRequest={{
          ...request,
          assertions: [{ expression: "status", operator: "exists" }],
          captures: { token: { value: "body.token", enabled: true } },
        }}
        onEditor={(value) => (editor = value)}
      />,
      { width: 20, height: 4 },
    )
    await render.renderOnce()

    expect(editor?.optionalTabMenuVisible).toBe(true)
    act(() => editor!.cycleInactiveTab(1))
    await render.renderOnce()
    expect(editor?.activeTab).toBe("settings")
    expect(editor?.optionalTabMenuActive).toBe(true)
  })

  it("skips + when the menu is disabled", async () => {
    let editor: UseEditBrowseResult | undefined
    const render = await testRender(
      <TabNavigationHarness
        initialRequest={request}
        optionalTabMenuEnabled={false}
        onEditor={(value) => (editor = value)}
      />,
      { width: 20, height: 4 },
    )
    await render.renderOnce()

    expect(editor?.optionalTabMenuVisible).toBe(false)
    act(() => editor!.cycleInactiveTab(1))
    await render.renderOnce()
    await render.renderOnce()
    expect(editor?.activeTab).toBe("headers")
    expect(editor?.optionalTabMenuActive).toBe(false)
  })
})
