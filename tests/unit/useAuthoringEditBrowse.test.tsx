import { describe, expect, it } from "bun:test"
import { useEffect, useState } from "react"
import { createTestRender } from "../testRender"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import { useEditBrowse } from "../../src/hooks/useEditBrowse"
import type { Request } from "../../src/schema"

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

describe("useEditBrowse assertion, capture, and tag rows", () => {
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
    expect(result.value).toEqual({ token: "body.token" })
  })

  it("deletes a capture when its key is cleared", async () => {
    const result: { value?: Request["captures"] | null } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        captures: { token: "body.token" },
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
        captures: { token: "body.token" },
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
    expect(result.value).toEqual({ token: "body.token" })
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
