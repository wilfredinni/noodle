import { describe, expect, it } from "bun:test"
import { useEffect, useState } from "react"
import { createTestRender } from "../testRender"
import { useRequestDraft } from "../../src/hooks/useRequestDraft"
import { useEditBrowse } from "../../src/hooks/useEditBrowse"
import type { Request } from "../../src/schema"
import { automationRows } from "../../src/ui/automationRows"

const testRender = createTestRender()
const request: Request = {
  id: "automation",
  name: "Automation",
  method: "GET",
  url: "https://example.com",
  headers: {},
  params: [],
  timeout: 0,
}

describe("useEditBrowse automation rows", () => {
  it("adds a structured assertion and parses its expected value", async () => {
    const result: { value?: Request["assertions"] } = {}
    function Harness() {
      const draft = useRequestDraft(request)
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("automation", 2)
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
          editor.enterBrowseAt("automation", 1)
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

  it("activates the same row after committing an earlier add row", async () => {
    const result: {
      value?: {
        tags: string[] | undefined
        row: number
        kind: string | undefined
        key: string
        expression: string
      }
    } = {}
    function Harness() {
      const draft = useRequestDraft({
        ...request,
        captures: { token: "body.token" },
      })
      const editor = useEditBrowse(draft.draft, draft)
      const [step, setStep] = useState(0)
      useEffect(() => {
        if (step === 0) {
          editor.enterBrowseAt("automation", 0)
          setStep(1)
        } else if (step === 1 && editor.editState.mode === "browsing") {
          editor.enterEdit()
          setStep(2)
        } else if (step === 2 && editor.editState.mode === "editing") {
          editor.setEditKey("smoke")
          setStep(3)
        } else if (step === 3 && editor.editKey === "smoke") {
          if (editor.commitEdit()) {
            editor.activateAt("automation", 2, false, "key")
          }
          setStep(4)
        } else if (
          step === 4 &&
          draft.draft?.tags &&
          editor.editState.mode === "editing"
        ) {
          const row = automationRows(draft.draft)[editor.editState.cursor.row]
          result.value = {
            tags: draft.draft.tags,
            row: editor.editState.cursor.row,
            kind: row?.kind,
            key: editor.editKey,
            expression: editor.editValue,
          }
        }
      }, [draft.draft, editor, step])
      return null
    }
    const render = await testRender(<Harness />, { width: 20, height: 4 })
    for (let i = 0; i < 8 && !result.value; i++) await render.renderOnce()
    expect(result.value).toEqual({
      tags: ["smoke"],
      row: 2,
      kind: "capture",
      key: "token",
      expression: "body.token",
    })
  })
})
