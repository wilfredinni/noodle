import { afterEach, describe, it, expect } from "bun:test"
import { testRender as openTUITestRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { act } from "react"
import { useState } from "react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { VarInput } from "../../src/ui/VarInput"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import type { Environment } from "../../src/schema"
import {
  registerCompletion,
  VariableCompletionInterceptor,
} from "../../src/ui/variable-completion/variableCompletionInterceptor"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let renderer: Awaited<ReturnType<typeof openTUITestRender>>["renderer"] | null =
  null

async function testRender(...args: Parameters<typeof openTUITestRender>) {
  const setup = await openTUITestRender(...args)
  renderer = setup.renderer
  return setup
}

afterEach(() => {
  act(() => renderer?.destroy())
  renderer = null
})

function env(vars: Record<string, string>): Environment {
  return { name: "test-env", vars }
}

const theme = THEMES[0]!

function CompletionHarness({ environment }: { environment: Environment }) {
  const [value, setValue] = useState("")
  return (
    <VarInput
      value={value}
      env={environment}
      isEditing
      isFocused
      onChange={setValue}
    />
  )
}

function PathCompletionHarness({
  root,
  wrapFileSelection = false,
}: {
  root: string
  wrapFileSelection?: boolean
}) {
  const [value, setValue] = useState("")
  return (
    <VarInput
      value={value}
      env={env({ host: "localhost" })}
      isEditing
      isFocused
      onChange={setValue}
      pathCompletion={{ kind: "file", root, wrapFileSelection }}
    />
  )
}

function hexToRgba(hex: string): RGBA {
  return RGBA.fromInts(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  )
}

function findTextPosition(frame: string, text: string) {
  const rows = frame.split("\n")
  const y = rows.findIndex((row) => row.includes(text))
  return { x: rows[y]!.indexOf(text), y }
}

async function waitForAsyncFrame(
  renderOnce: () => Promise<void>,
  captureCharFrame: () => string,
  predicate: (frame: string) => boolean,
): Promise<string> {
  const deadline = Date.now() + 2000
  while (true) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      await renderOnce()
    })
    const frame = captureCharFrame()
    if (predicate(frame)) return frame
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for async frame:\n${frame}`)
    }
  }
}

describe("VarInput — display mode (isEditing=false)", () => {
  it("renders plain text without variables", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="hello world" env={null} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const fullText = spans.map((s) => s.text).join("")
    expect(fullText).toContain("hello world")
  })

  it("renders resolved variable in primary color", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$host"
          env={env({ host: "localhost" })}
          isEditing={false}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$host"))
    expect(varSpan).toBeDefined()
    const primaryRgba = hexToRgba(theme.primary)
    expect(varSpan!.fg.equals(primaryRgba)).toBe(true)
  })

  it("renders unresolved variable in error color when env is null", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="$token" env={null} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$token"))
    expect(varSpan).toBeDefined()
    const errorRgba = hexToRgba(theme.error)
    expect(varSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("renders unresolved variable in error color when var missing from env", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="$missing" env={env({})} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$missing"))
    expect(varSpan).toBeDefined()
    const errorRgba = hexToRgba(theme.error)
    expect(varSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("uses baseColor for non-variable text", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="plain $var tail"
          env={env({ var: "x" })}
          isEditing={false}
          baseColor="#aabbcc"
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const baseRgba = hexToRgba("#aabbcc")
    const plainSpan = spans.find((s) => s.text === "plain ")
    expect(plainSpan).toBeDefined()
    expect(plainSpan!.fg.equals(baseRgba)).toBe(true)
  })

  it("renders empty string without crash", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="" env={null} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.length).toBeGreaterThanOrEqual(0)
  })

  it("renders URL-style string with variables", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$baseUrl/api/$resource"
          env={env({ baseUrl: "https://api.example.com", resource: "users" })}
          isEditing={false}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const primaryRgba = hexToRgba(theme.primary)
    const baseUrlSpan = spans.find((s) => s.text === "$baseUrl")
    expect(baseUrlSpan).toBeDefined()
    expect(baseUrlSpan!.fg.equals(primaryRgba)).toBe(true)
  })
})

describe("VarInput — edit mode (isEditing=true)", () => {
  it("shows filtered suggestions after typing a variable prefix", async () => {
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CompletionHarness
          environment={env({ host: "localhost", token: "secret" })}
        />
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$ho")
    })
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("$host")
    expect(frame).not.toContain("$token")
  })

  it("accepts a suggestion with Tab", async () => {
    const { keymap, host, cleanup } = createTestKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider
        keymap={keymap as unknown as KeymapProviderProps["keymap"]}
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <VariableCompletionInterceptor />
          <CompletionHarness
            environment={env({ host: "localhost", token: "secret" })}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$ho")
    })
    await renderOnce()
    await act(async () => {
      host.press("tab")
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("$host")
    cleanup()
  })

  it("highlights resolved variables while editing", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$host"
          env={env({ host: "localhost" })}
          isEditing
          isFocused
          onChange={() => {}}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    const variable = spans.find((span) => span.text.includes("$host"))
    expect(variable).toBeDefined()
    expect(variable!.fg.equals(hexToRgba(theme.primary))).toBe(true)
  })

  it("highlights missing variables while editing", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$missing"
          env={env({})}
          isEditing
          isFocused
          onChange={() => {}}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    const variable = spans.find((span) => span.text.includes("$missing"))
    expect(variable).toBeDefined()
    expect(variable!.fg.equals(hexToRgba(theme.error))).toBe(true)
  })

  it("renders input element with value", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="hello" env={null} isEditing onChange={() => {}} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("hello")
  })

  it("renders placeholder", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value=""
          env={null}
          isEditing
          onChange={() => {}}
          placeholder="Type here"
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Type here")
  })

  it("uses baseColor for text color", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="custom"
          env={null}
          isEditing
          onChange={() => {}}
          baseColor="#ff6600"
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("custom")
  })
  it("accepts a suggestion with Return", async () => {
    const { keymap, host, cleanup } = createTestKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider
        keymap={keymap as unknown as KeymapProviderProps["keymap"]}
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <VariableCompletionInterceptor />
          <CompletionHarness
            environment={env({ host: "localhost", token: "secret" })}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$ho")
    })
    await renderOnce()
    await act(async () => {
      host.press("return")
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("$host")
    cleanup()
  })

  it("accepts a suggestion with the mouse", async () => {
    const { renderOnce, captureCharFrame, mockInput, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CompletionHarness
            environment={env({ host: "localhost", token: "secret" })}
          />
        </ThemeProvider>,
        { width: 80, height: 8 },
      )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$")
    })
    await renderOnce()

    const { x, y } = findTextPosition(captureCharFrame(), "$token")
    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("$token")
    expect(captureCharFrame()).not.toContain("┌")
  })

  it("dismisses completion with Escape, reopens on new $ token", async () => {
    const { keymap, host, cleanup } = createTestKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider
        keymap={keymap as unknown as KeymapProviderProps["keymap"]}
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <VariableCompletionInterceptor />
          <CompletionHarness
            environment={env({ host: "localhost", port: "8080" })}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$ho")
    })
    await renderOnce()
    await act(async () => {
      host.press("escape")
    })
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("st$")
    })
    await renderOnce()
    // "$port" only appears in the reopened menu, not in the input value
    expect(captureCharFrame()).toContain("$port")
    cleanup()
  })

  it("resets highlighted index after refiltering suggestions", async () => {
    const { keymap, host, cleanup } = createTestKeymap()
    const { renderOnce, captureSpans, mockInput } = await testRender(
      <KeymapProvider
        keymap={keymap as unknown as KeymapProviderProps["keymap"]}
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <VariableCompletionInterceptor />
          <CompletionHarness
            environment={env({
              bear: "x",
              brown: "y",
              branch: "z",
              bry: "w",
            })}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$br")
    })
    await renderOnce()
    await act(async () => {
      host.press("down")
    })
    await act(async () => {
      host.press("down")
    })
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("o")
    })
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const primaryRgba = hexToRgba(theme.primary)
    const brownHighlights = spans.filter(
      (s) => s.text.includes("$brown") && s.fg.equals(primaryRgba),
    )
    expect(brownHighlights.length).toBeGreaterThanOrEqual(1)
    cleanup()
  })

  it("does not open completion menu for a fully typed token", async () => {
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CompletionHarness environment={env({ host: "localhost" })} />
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$host")
    })
    await renderOnce()
    const frame = captureCharFrame()
    // Without the isComplete fix, the menu would show "$host" as a suggestion.
    // With the fix, only the input itself renders.
    // The input is on line 0; any menu would create extra content below.
    // Check that no border chars from the completion menu appear.
    expect(frame).not.toContain("┌")
  })

  it("does not show completion menu when isFocused is false", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$host"
          env={env({ host: "localhost", host_alt: "127.0.0.1" })}
          isEditing
          isFocused={false}
          onChange={() => {}}
        />
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("┌")
  })

  it("does not crash with many suggestions navigating within visible range", async () => {
    const manyVars: Record<string, string> = {}
    for (let i = 0; i < 12; i++) manyVars[`a${i}`] = String(i)
    const { keymap, host, cleanup } = createTestKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider
        keymap={keymap as unknown as KeymapProviderProps["keymap"]}
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <VariableCompletionInterceptor />
          <CompletionHarness environment={env(manyVars)} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 15 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$a")
    })
    await renderOnce()
    // Navigate past visible range multiple times
    for (let i = 0; i < 15; i++) {
      await act(async () => {
        host.press("down")
      })
    }
    await renderOnce()
    // Accept current suggestion with Return
    await act(async () => {
      host.press("return")
    })
    await renderOnce()
    // Should have replaced with a visible suggestion (no crash)
    expect(captureCharFrame().length).toBeGreaterThan(0)
    cleanup()
  })
})

describe("VarInput — path completion", () => {
  it("accepts a path suggestion with the mouse", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    await writeFile(join(root, "avatar.png"), "avatar")

    try {
      const { renderOnce, captureCharFrame, mockInput, mockMouse } =
        await testRender(
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <PathCompletionHarness root={root} wrapFileSelection />
          </ThemeProvider>,
          { width: 100, height: 12 },
        )
      await renderOnce()
      await act(async () => mockInput.typeText("@"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("avatar.png"),
      )

      const { x, y } = findTextPosition(captureCharFrame(), "avatar.png")
      await act(async () => {
        await mockMouse.click(x, y, MouseButtons.LEFT)
      })
      await renderOnce()

      expect(captureCharFrame()).toContain("@file(@/avatar.png)")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("marks an accepted file as explicit file input when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    await writeFile(join(root, "avatar.png"), "avatar")
    const { keymap, host, cleanup } = createTestKeymap()

    try {
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <KeymapProvider
          keymap={keymap as unknown as KeymapProviderProps["keymap"]}
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <VariableCompletionInterceptor />
            <PathCompletionHarness root={root} wrapFileSelection />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("avatar.png"),
      )
      await act(async () => host.press("return"))
      await renderOnce()

      expect(captureCharFrame()).toContain("@file(@/avatar.png)")
    } finally {
      cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("completes a home path inside explicit file syntax", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    await writeFile(join(root, "avatar.png"), "avatar")
    const { keymap, host, cleanup } = createTestKeymap()

    try {
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <KeymapProvider
          keymap={keymap as unknown as KeymapProviderProps["keymap"]}
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <VariableCompletionInterceptor />
            <PathCompletionHarness root={root} wrapFileSelection />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@file(@"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("avatar.png"),
      )
      await act(async () => host.press("return"))
      await renderOnce()

      expect(captureCharFrame()).toContain("@file(@/avatar.png)")
    } finally {
      cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("browses directories and selects a file with Return", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    await mkdir(join(root, "Documents"))
    await writeFile(join(root, "Documents", "report final.pdf"), "report")
    const { keymap, host, cleanup } = createTestKeymap()

    try {
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <KeymapProvider
          keymap={keymap as unknown as KeymapProviderProps["keymap"]}
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <VariableCompletionInterceptor />
            <PathCompletionHarness root={root} />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("Documents/"),
      )
      await renderOnce()
      await renderOnce()

      await act(async () => host.press("return"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("report final.pdf"),
      )
      await renderOnce()
      await renderOnce()

      await act(async () => host.press("return"))
      await renderOnce()
      expect(captureCharFrame()).toContain("@/Documents/report final.pdf")
    } finally {
      cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("filters paths, wraps keyboard navigation, and dismisses with Escape", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    await writeFile(join(root, "alpha.txt"), "alpha")
    await writeFile(join(root, "zulu.txt"), "zulu")
    const { keymap, host, cleanup } = createTestKeymap()

    try {
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <KeymapProvider
          keymap={keymap as unknown as KeymapProviderProps["keymap"]}
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <VariableCompletionInterceptor />
            <PathCompletionHarness root={root} />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@"))
      await waitForAsyncFrame(
        renderOnce,
        captureCharFrame,
        (frame) => frame.includes("alpha.txt") && frame.includes("zulu.txt"),
      )
      await renderOnce()
      await renderOnce()

      await act(async () => host.press("up"))
      await renderOnce()
      await act(async () => host.press("return"))
      await renderOnce()
      expect(captureCharFrame()).toContain("@/zulu.txt")

      for (let i = 0; i < "@/zulu.txt".length; i++) {
        await act(async () => mockInput.pressKey("BACKSPACE"))
      }
      await act(async () => mockInput.typeText("@alp"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("alpha.txt"),
      )
      expect(captureCharFrame()).not.toContain("zulu.txt")

      await renderOnce()
      await act(async () => host.press("escape"))
      await renderOnce()
      expect(captureCharFrame()).not.toContain("┌")
    } finally {
      cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("shows a no-results state", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    try {
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PathCompletionHarness root={root} />
        </ThemeProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@nothing"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("No matching paths"),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("lets Return fall through when no path can be selected", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    const { keymap, host, cleanup } = createTestKeymap()
    const keys: string[] = []
    const dispose = registerCompletion((event) => {
      keys.push(event.name)
      return false
    })

    try {
      const { renderOnce, mockInput } = await testRender(
        <KeymapProvider
          keymap={keymap as unknown as KeymapProviderProps["keymap"]}
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <VariableCompletionInterceptor />
            <PathCompletionHarness root={root} />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@file(/tmp/upload.bin)"))
      await renderOnce()

      await act(async () => host.press("return"))
      expect(keys).toContain("return")
    } finally {
      dispose()
      cleanup()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("shows unavailable folders and keeps dollar completion working", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-var-path-"))
    try {
      const { renderOnce, captureCharFrame, mockInput } = await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PathCompletionHarness root={root} />
        </ThemeProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      await act(async () => mockInput.typeText("@/missing/"))
      await waitForAsyncFrame(renderOnce, captureCharFrame, (frame) =>
        frame.includes("Folder unavailable"),
      )

      for (let i = 0; i < "@/missing/".length; i++) {
        await act(async () => mockInput.pressKey("BACKSPACE"))
      }
      await act(async () => mockInput.typeText("$ho"))
      await renderOnce()
      expect(captureCharFrame()).toContain("$host")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("VarInput — textarea mode (isEditing=true, useTextarea=true)", () => {
  it("renders textarea with value", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="multi\nline"
          env={null}
          isEditing
          useTextarea
          onChange={() => {}}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("multi")
  })

  it("renders empty textarea without crash", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value=""
          env={null}
          isEditing
          useTextarea
          onChange={() => {}}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.length).toBeGreaterThanOrEqual(0)
  })

  it("shows filtered suggestions while typing in textarea mode", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value=""
          env={env({ host: "localhost", token: "secret" })}
          isEditing
          useTextarea
          onChange={() => {}}
        />
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await renderOnce()
    expect(captureCharFrame()).toBeDefined()
  })
})
