import { describe, expect, it } from "bun:test"
import { act } from "react"
import { useFormNavigation } from "../../src/hooks/useFormNavigation"
import { createTestRender } from "../testRender"

const testRender = createTestRender()

describe("useFormNavigation", () => {
  it("commits before moving and blocks navigation while a select is open", async () => {
    const commits: number[] = []
    let allowCommit = true
    let form: ReturnType<typeof useFormNavigation> | null = null

    function Harness() {
      form = useFormNavigation({
        fieldCount: 3,
        commitField: (index) => {
          commits.push(index)
          return allowCommit
        },
      })
      return null
    }

    const render = await testRender(<Harness />, { width: 20, height: 4 })
    await render.renderOnce()

    await act(async () => expect(form!.moveField(1)).toBe("moved"))
    expect(form!.fieldIndex).toBe(1)
    expect(commits).toEqual([0])

    await act(async () => form!.setSelectOpen(true))
    expect(form!.moveField(1)).toBe("blocked")
    expect(commits).toEqual([0])

    await act(async () => form!.setSelectOpen(false))
    allowCommit = false
    expect(form!.moveField(1)).toBe("blocked")
    expect(form!.fieldIndex).toBe(1)

    allowCommit = true
    await act(async () => expect(form!.moveField(1)).toBe("moved"))
    expect(form!.fieldIndex).toBe(2)
    expect(form!.moveField(1)).toBe("after")
  })
})
