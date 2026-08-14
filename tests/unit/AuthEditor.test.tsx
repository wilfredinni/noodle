import { describe, expect, it } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { act, useState } from "react"
import { AuthEditor } from "../../src/ui/AuthEditor"
import { initialEditState } from "../../src/ui/editMode"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"
import type { Auth } from "../../src/schema"
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../../src/auth/defaults"

const testRender = createTestRender()

describe("AuthEditor", () => {
  it("renders dynamic OAuth fields, legacy warnings, and masks secrets", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={100} height={100} style={{ flexDirection: "row" }}>
            <box width={50}>
              <AuthEditor
                auth={{
                  ...defaultOAuth1Auth(),
                  consumer_secret: "oauth1-secret",
                  signature_method: "RSA-SHA256",
                  private_key: "oauth1-private-key",
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
            <box width={50}>
              <AuthEditor
                auth={{
                  ...defaultOAuth2Auth(),
                  grant_type: "password",
                  client_secret: "oauth2-secret",
                  password: "password-secret",
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
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 100 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("OAuth 1.0a")
    expect(frame).toContain("Private Key*")
    expect(frame).toContain("OAuth 2.0")
    expect(frame).toContain("Legacy grant")
    expect(frame).toContain("Refresh Header Parameters")
    expect(frame).not.toContain("oauth1-secret")
    expect(frame).not.toContain("oauth1-private-key")
    expect(frame).not.toContain("oauth2-secret")
    expect(frame).not.toContain("password-secret")
    cleanup()
  })

  const autocompleteCases: Array<{ name: string; auth: Auth; row: number }> = [
    {
      name: "NTLM username",
      auth: {
        type: "ntlm",
        username: "",
        password: "",
        domain: "",
        workstation: "",
      },
      row: 1,
    },
    {
      name: "NTLM password",
      auth: {
        type: "ntlm",
        username: "",
        password: "",
        domain: "",
        workstation: "",
      },
      row: 2,
    },
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

  it("renders NTLM fields and masks the password", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={70} height={30}>
            <AuthEditor
              auth={{
                type: "ntlm",
                username: "alice",
                password: "do-not-render",
                domain: "EXAMPLE",
                workstation: "NOODLE",
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
    expect(frame).toContain("NTLMv2")
    expect(frame).toContain("Username*")
    expect(frame).toContain("Password*")
    expect(frame).toContain("Domain")
    expect(frame).toContain("Workstation")
    expect(frame).not.toContain("do-not-render")
    cleanup()
  })

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

  it("renders descriptions and required markers for other auth fields", async () => {
    const cases: Array<{
      auth: Auth
      labels: string[]
      descriptions: string[]
    }> = [
      {
        auth: { type: "bearer", token: "token" },
        labels: ["Token*"],
        descriptions: ["Bearer token sent in the Authorization header."],
      },
      {
        auth: { type: "basic", user: "user", pass: "pass" },
        labels: ["Username*", "Password*"],
        descriptions: [
          "Username used for HTTP Basic authentication.",
          "Password used for HTTP Basic authentication.",
        ],
      },
      {
        auth: {
          type: "api_key",
          key: "X-API-Key",
          value: "secret",
          placement: "header",
        },
        labels: ["Key*", "Value*", "Add To"],
        descriptions: [
          "Header or query parameter name for the API key.",
          "API key value sent with the request.",
          "Where to send the API key.",
        ],
      },
    ]

    for (const { auth, labels, descriptions } of cases) {
      const { keymap, cleanup } = setupKeymap()
      const { renderOnce, captureCharFrame } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box width={70} height={20}>
              <AuthEditor
                auth={auth}
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
        { width: 70, height: 20 },
      )
      await renderOnce()
      const frame = captureCharFrame()
      for (const label of labels) expect(frame).toContain(label)
      for (const description of descriptions) {
        expect(frame).toContain(description)
      }
      cleanup()
    }
  })

  it("activates the API key placement row before opening its select", async () => {
    const { keymap, cleanup } = setupKeymap()
    let focusedRow = -1
    const { renderOnce, captureCharFrame, mockMouse, renderer } =
      await testRender(
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
    const placementRow = renderer.root.findDescendantById(
      "auth-3",
    ) as BoxRenderable
    const placementLine = captureCharFrame().split("\n")[placementRow.screenY]!
    const placementLabelX = placementLine.indexOf("Header")

    await act(async () => {
      await mockMouse.click(
        placementRow.screenX + 50,
        placementRow.screenY,
        MouseButtons.LEFT,
      )
    })
    expect(focusedRow).toBe(-1)

    await act(async () => {
      await mockMouse.click(
        placementLabelX,
        placementRow.screenY,
        MouseButtons.LEFT,
      )
    })
    expect(focusedRow).toBe(3)
    cleanup()
  })
})
