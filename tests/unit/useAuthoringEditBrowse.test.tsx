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
          editor.enterBrowseAt("assertions", 0)
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

  it("adds tags from the Settings tab through the existing draft operation", async () => {
    const result: { value?: string[] } = {}
    function Harness() {
      const draft = useRequestDraft(request)
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("settings", 5)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditValue("smoke")
          setStep(3)
        } else if (step === 3 && editor.editValue === "smoke") {
          editor.commitEdit()
          setStep(4)
        } else if (step === 4 && draft.draft?.tags) {
          result.value = draft.draft.tags
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 7 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual(["smoke"])
  })
})
