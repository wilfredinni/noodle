import { describe, expect, it } from "bun:test"
import { useEffect } from "react"
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
})
