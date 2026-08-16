import { describe, expect, it } from "bun:test"
import { act } from "react"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import pkg from "../../package.json" with { type: "json" }
import { Header } from "../../src/ui/Header"
import { ThemeProvider, THEMES } from "../../src/ui/theme"

const testRender = createTestRender()

function textPosition(frame: string, text: string): [number, number] {
  const lines = frame.split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  return [lines[y].indexOf(text), y]
}

describe("Header", () => {
  it("renders the environment at the top right and activates its picker", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            collectionLabel="jsonplaceholder"
            envLabel="development"
            envStatus="active"
            envColor="warning"
            onEnvironmentActivate={() => opened++}
          />
        </ThemeProvider>,
        { width: 80, height: 1 },
      )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain(" /  jsonplaceholder ▾")
    expect(frame).toContain("⛁ development")
    expect(frame.indexOf("jsonplaceholder")).toBeLessThan(
      frame.indexOf("⛁ development"),
    )
    expect(frame.indexOf("⛁ development")).toBeGreaterThan(
      frame.indexOf("Noodle"),
    )
    const iconSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text === "⛁")
    const labelSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("development"))
    expect(iconSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.warning))).toBe(true)
    expect(labelSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.text))).toBe(true)

    const [x, y] = textPosition(frame, "development")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(opened).toBe(0)

    await mockMouse.click(x, y, MouseButtons.LEFT)
    expect(opened).toBe(1)
  })

  it("opens About on left click of the brand only", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header
          collectionLabel="jsonplaceholder"
          envLabel="development"
          envStatus="active"
          onAboutActivate={() => opened++}
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "Noodle")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(opened).toBe(0)

    await mockMouse.click(x, y, MouseButtons.LEFT)
    expect(opened).toBe(1)
  })

  it("renders the collection after the brand and activates its switcher", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            collectionLabel="jsonplaceholder"
            envLabel="development"
            envStatus="active"
            onCollectionActivate={() => opened++}
          />
        </ThemeProvider>,
        { width: 80, height: 1 },
      )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain(" /  jsonplaceholder ▾")
    expect(frame.indexOf("jsonplaceholder")).toBeGreaterThan(
      frame.indexOf("Noodle"),
    )

    const [x, y] = textPosition(frame, "jsonplaceholder")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(opened).toBe(0)

    await act(async () => {
      await mockMouse.moveTo(0, y)
      await mockMouse.moveTo(x, y)
    })
    await renderOnce()
    const hoverColor = RGBA.fromHex(THEMES[0]!.backgroundElement)
    const hoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("jsonplaceholder"))
    expect(hoveredSpan!.bg.equals(hoverColor)).toBe(true)

    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()
    expect(opened).toBe(1)
    const clickedSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("jsonplaceholder"))
    expect(clickedSpan!.bg.equals(hoverColor)).toBe(false)
  })

  it("keeps the collection visible but muted when switching is disabled", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header
          collectionLabel="jsonplaceholder"
          envLabel="development"
          envStatus="active"
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const collectionSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("jsonplaceholder"))
    expect(collectionSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.textMuted))).toBe(
      true,
    )
    const environmentSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find(
        (span) => span.text.includes("⛁") && span.text.includes("development"),
      )
    expect(environmentSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.textMuted))).toBe(
      true,
    )
  })

  it("clears the environment hover when it is activated", async () => {
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            collectionLabel="jsonplaceholder"
            envLabel="dev"
            envStatus="active"
            onEnvironmentActivate={() => {}}
          />
        </ThemeProvider>,
        { width: 80, height: 1 },
      )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "dev")
    await act(async () => {
      await mockMouse.moveTo(x, y)
    })
    await renderOnce()

    const hoverColor = RGBA.fromHex(THEMES[0]!.backgroundElement)
    const hoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("dev"))
    expect(hoveredSpan!.bg.equals(hoverColor)).toBe(true)

    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()

    const clickedSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("dev"))
    expect(clickedSpan!.bg.equals(hoverColor)).toBe(false)
  })

  it("truncates long collection and environment names without overlap", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header
          collectionLabel="a-very-long-collection-name"
          envLabel="a-very-long-development-environment"
          envStatus="active"
        />
      </ThemeProvider>,
      { width: 30, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Noodle")
    expect(frame).toContain(" /  a-v… ▾")
    expect(frame).toContain("⛁ a-ve…")
    expect(frame.indexOf("a-v…")).toBeLessThan(frame.indexOf("⛁ a-ve…"))
  })

  it("keeps the title visible with wide Unicode context names", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header
          collectionLabel="请求🚀collection"
          envLabel="开发😀development"
          envStatus="active"
        />
      </ThemeProvider>,
      { width: 34, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Noodle")
    expect(frame).toContain("▾")
    expect(frame).toContain("⛁")
    expect(frame).not.toContain("�")
  })

  it("hides active update status before the wide-header breakpoint", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header
          collectionLabel="jsonplaceholder-collection"
          envLabel="production"
          envStatus="active"
          updateFlow={{
            phase: "downloading",
            version: "v9.9.9",
            installType: "binary",
          }}
        />
      </ThemeProvider>,
      { width: 40, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toContain("Downloading")
    expect(frame).not.toContain(`v${pkg.version}`)
    expect(frame).toContain("jsonplac…")
    expect(frame).toContain("⛁ production")
  })

  it("renders active update states after the version with shared colors", async () => {
    const cases = [
      {
        flow: {
          phase: "downloading",
          version: "v9.9.9",
          installType: "binary",
        } as const,
        suffix: " ↓ Downloading v9.9.9…",
        status: "Downloading",
        color: THEMES[0]!.secondary,
      },
      {
        flow: {
          phase: "installing",
          version: "v9.9.9",
          installType: "brew",
        } as const,
        suffix: " ⚙ Installing v9.9.9…",
        status: "Installing",
        color: THEMES[0]!.warning,
      },
      {
        flow: { phase: "done", version: "v9.9.9" } as const,
        suffix: " ↻ Restart to apply v9.9.9",
        status: "Restart to apply v9.9.9",
        color: THEMES[0]!.warning,
      },
      {
        flow: { phase: "failed", message: "network down" } as const,
        suffix: " ✕ Update failed",
        status: "Update failed",
        color: THEMES[0]!.error,
      },
    ]

    for (const testCase of cases) {
      const { renderOnce, captureCharFrame, captureSpans } = await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            collectionLabel="collection"
            envLabel="dev"
            envStatus="active"
            updateFlow={testCase.flow}
          />
        </ThemeProvider>,
        { width: 120, height: 1 },
      )
      await renderOnce()

      const frame = captureCharFrame()
      const statusStart = frame.indexOf(testCase.suffix.trimStart())
      expect(frame).toContain(`Noodle v${pkg.version}${testCase.suffix}`)
      expect(statusStart).toBeLessThan(frame.indexOf("collection"))
      const statusSpan = captureSpans()
        .lines.flatMap((line) => line.spans)
        .find((span) => span.text.includes(testCase.status))
      expect(statusSpan?.fg.equals(RGBA.fromHex(testCase.color))).toBe(true)
    }
  })

  it("keeps quiet update states out of the Header", async () => {
    const flows = [
      { phase: "idle" },
      { phase: "checking" },
      { phase: "up_to_date" },
      {
        phase: "confirm",
        version: "v9.9.9",
        installType: "brew",
      },
    ] as const

    for (const updateFlow of flows) {
      const { renderOnce, captureCharFrame } = await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            collectionLabel="collection"
            envLabel="dev"
            envStatus="active"
            updateFlow={updateFlow}
          />
        </ThemeProvider>,
        { width: 100, height: 1 },
      )
      await renderOnce()

      const frame = captureCharFrame()
      expect(frame).toContain(`Noodle v${pkg.version}`)
      expect(frame).not.toContain("Checking for updates")
      expect(frame).not.toContain("Update failed")
      expect(frame).not.toContain("✓")
    }
  })
})
