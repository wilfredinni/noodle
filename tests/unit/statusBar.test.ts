import { describe, it, expect } from "bun:test"
import { statusBarText } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"

const defaults = bindingDefaults()

function res(
  status: number,
  statusText: string,
  timeMs: number,
  bodyLen: number,
) {
  return {
    status,
    statusText,
    headers: {},
    body: "x".repeat(bodyLen),
    timeMs,
  }
}

describe("statusBarText", () => {
  // ── LEFT zone ──────────────────────────────────────

  it("left is empty when no request selected (idle, no method)", () => {
    const r = statusBarText({
      method: "",
      url: "",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("")
  })

  it("left shows method and url path when idle with request", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("GET /users")
  })

  it("left extracts path from full URL when idle", () => {
    const r = statusBarText({
      method: "POST",
      url: "https://api.example.com/v2/users",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "prod",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("POST /v2/users")
  })

  it("left shows spinner + method + url path when sending", () => {
    const r = statusBarText({
      method: "DELETE",
      url: "/items/1",
      isDirty: false,
      sendState: {
        status: "sending",
        request: {
          id: "r1",
          name: "del",
          method: "DELETE",
          url: "/items/1",
          headers: {},
          params: [],
          timeout: 0,
        },
      },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠧",
    })
    expect(r.left).toBe("⠧ DELETE /items/1...")
  })

  it("left shows status line when done (200)", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: { status: "done", response: res(200, "OK", 42, 1200) },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("200 OK · 42ms · 1.2KB")
  })

  it("left shows status line when done (404)", () => {
    const r = statusBarText({
      method: "GET",
      url: "/missing",
      isDirty: false,
      sendState: { status: "done", response: res(404, "Not Found", 35, 200) },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("404 Not Found · 35ms · 200B")
  })

  it("left shows status line when done (500)", () => {
    const r = statusBarText({
      method: "GET",
      url: "/error",
      isDirty: false,
      sendState: {
        status: "done",
        response: res(500, "Internal Server Error", 120, 5000),
      },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("500 Internal Server Error · 120ms · 4.9KB")
  })

  it("left shows error message on send failure", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: {
        status: "error",
        request: {
          id: "r2",
          name: "fail",
          method: "GET",
          url: "/users",
          headers: {},
          params: [],
          timeout: 0,
        },
        error: new Error("Connection refused"),
      },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("✗ Connection refused")
  })

  it("left shows empty statusText as empty string in status line", () => {
    const r = statusBarText({
      method: "GET",
      url: "/test",
      isDirty: false,
      sendState: { status: "done", response: res(200, "", 42, 100) },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.left).toBe("200 · 42ms · 100B")
  })

  // ── CENTER zone ────────────────────────────────────

  it("center shows env name when not dirty and save is idle", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("● dev")
  })

  it("center does not append a dirty marker to environment", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: true,
      sendState: { status: "idle" },
      envLabel: "prod",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("● prod")
  })

  it("center shows (no env) when envLabel is empty", () => {
    const r = statusBarText({
      method: "",
      url: "",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("(no env)")
  })

  it("center shows (no env) when envLabel is '(no env)'", () => {
    const r = statusBarText({
      method: "",
      url: "",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "(no env)",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("(no env)")
  })

  it("center shows save success message", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "success", message: "Saved users-get.yml" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("✓ Saved users-get.yml")
  })

  it("center shows save error message", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "error", message: "Write permission denied" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("✗ Write permission denied")
  })

  it("center shows save success overrides dirty dot", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: true,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "success", message: "Saved users-get.yml" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(r.center).toBe("✓ Saved users-get.yml")
  })

  it("each section is a string", () => {
    const r = statusBarText({
      method: "GET",
      url: "/users",
      isDirty: false,
      sendState: { status: "idle" },
      envLabel: "dev",
      saveState: { kind: "idle" },
      kb: defaults,
      spinnerFrame: "⠋",
    })
    expect(typeof r.left).toBe("string")
    expect(typeof r.center).toBe("string")
    expect(typeof r.right).toBe("string")
  })
})
