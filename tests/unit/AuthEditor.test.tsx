import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { act, useState } from "react"
import { AuthEditor } from "../../src/ui/AuthEditor"
import { initialEditState } from "../../src/ui/editMode"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"
import type { Auth } from "../../src/schema"

const testRender = createTestRender()

describe("AuthEditor", () => {
  const autocompleteCases: Array<{ name: string; auth: Auth; row: number }> = [
    {
      name: "bearer token",
      auth: { type: "bearer", token: "" },
      row: 1,
    },
    {
      name: "basic username",
      auth: { type: "basic", user: "", pass: "" },
      row: 1,
    },
    {
      name: "basic password",
      auth: { type: "basic", user: "", pass: "" },
      row: 2,
    },
    {
      name: "API key name",
      auth: { type: "api_key", key: "", value: "", placement: "header" },
      row: 1,
    },
    {
      name: "API key value",
      auth: { type: "api_key", key: "", value: "", placement: "header" },
      row: 2,
    },
    {
      name: "AWS access key",
      auth: {
        type: "aws_sigv4",
        access_key: "",
        secret_key: "",
        region: "",
        service: "",
      },
      row: 1,
    },
    {
      name: "AWS secret key",
      auth: {
        type: "aws_sigv4",
        access_key: "",
        secret_key: "",
        region: "",
        service: "",
      },
      row: 2,
    },
    {
      name: "AWS region",
      auth: {
        type: "aws_sigv4",
        access_key: "",
        secret_key: "",
        region: "",
        service: "",
      },
      row: 3,
    },
    {
      name: "AWS service",
      auth: {
        type: "aws_sigv4",
        access_key: "",
        secret_key: "",
        region: "",
        service: "",
      },
      row: 4,
    },
    {
      name: "AWS session token",
      auth: {
        type: "aws_sigv4",
        access_key: "",
        secret_key: "",
        region: "",
        service: "",
        session_token: "",
      },
      row: 5,
    },
  ]

  for (const { name, auth, row } of autocompleteCases) {
    it(`shows variable autocomplete for ${name}`, async () => {
      const { keymap, cleanup } = setupKeymap()
      function CompletionEditor() {
        const [editValue, setEditValue] = useState("")
        return (
          <AuthEditor
            auth={auth}
            editState={{
              mode: "editing",
              cursor: { field: "auth", row, addingRow: false },
              editingRow: row,
            }}
            inEdit
            browseActive={false}
            editValue={editValue}
            setEditValue={setEditValue}
            theme={THEMES[0]!}
            activeEnv={{
              name: "dev",
              vars: { AWS_PROFILE: "development" },
            }}
            onAuthTypeChange={() => {}}
            onApiKeyPlacementChange={() => {}}
          />
        )
      }
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box width={70} height={30}>
              <CompletionEditor />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 70, height: 30 },
      )
      await renderOnce()

      await act(async () => mockInput.typeText("$AWS"))
      await renderOnce()

      expect(captureCharFrame()).toContain("$AWS_PROFILE")
      cleanup()
    })
  }

  it("renders AWS fields and masks secret values", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={70} height={30}>
            <AuthEditor
              auth={{
                type: "aws_sigv4",
                access_key: "$AWS_ACCESS_KEY_ID",
                secret_key: "do-not-render",
                region: "us-east-1",
                service: "execute-api",
                session_token: "also-secret",
              }}
              editState={initialEditState()}
              inEdit={false}
              browseActive={false}
              editValue=""
              setEditValue={() => {}}
              theme={THEMES[0]!}
              onAuthTypeChange={() => {}}
              onApiKeyPlacementChange={() => {}}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("AWS Signature v4")
    expect(frame).toContain("Access Key*")
    expect(frame).toContain("Secret Key*")
    expect(frame).toContain("Region*")
    expect(frame).toContain("Service*")
    expect(frame).toContain("Session Token")
    expect(frame).toContain("us-east-1")
    expect(frame).toContain("execute-api")
    expect(frame).toContain("AWS access key ID used to identify the signer.")
    expect(frame).toContain("Optional token for temporary AWS credentials.")
    expect(frame).not.toContain("do-not-render")
    expect(frame).not.toContain("also-secret")
    cleanup()
  })

  it("activates the API key placement row before opening its select", async () => {
    const { keymap, cleanup } = setupKeymap()
    let focusedRow = -1
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={60} height={10}>
            <AuthEditor
              auth={{
                type: "api_key",
                key: "X-API-Key",
                value: "secret",
                placement: "header",
              }}
              editState={initialEditState()}
              inEdit={false}
              browseActive={false}
              editValue=""
              setEditValue={() => {}}
              theme={THEMES[0]!}
              onAuthTypeChange={() => {}}
              onApiKeyPlacementChange={() => {}}
              onFocusRow={(row) => {
                focusedRow = row
              }}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("Header"))

    await act(async () => {
      await mockMouse.click(50, y, MouseButtons.LEFT)
    })
    expect(focusedRow).toBe(-1)

    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("Header"), y, MouseButtons.LEFT)
    })
    expect(focusedRow).toBe(3)
    cleanup()
  })
})
