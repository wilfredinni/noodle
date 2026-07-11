import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { EnvSidebar } from "../../src/ui/env-editor/EnvSidebar"

describe("EnvSidebar", () => {
  it("renders env names", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev", "staging", "prod"]}
          selectedEnvName={null}
          activeEnvName={undefined}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("dev")
    expect(frame).toContain("staging")
    expect(frame).toContain("prod")
  })

  it("shows (no environments) when list is empty", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={[]}
          selectedEnvName={null}
          activeEnvName={undefined}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("(no environments)")
  })

  it("shows dirty dot on selected env when dirty", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev", "prod"]}
          selectedEnvName={"dev"}
          activeEnvName={undefined}
          dirty={true}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("\u25cf")
  })

  it("does not show dirty dot when dirty is false", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev"]}
          selectedEnvName={"dev"}
          activeEnvName={undefined}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("\u25cf")
  })

  it("shows title Environments", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev"]}
          selectedEnvName={null}
          activeEnvName={undefined}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Environments")
  })

  it("uses theme.text foreground for all env names", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev", "prod"]}
          selectedEnvName={null}
          activeEnvName={undefined}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    const devSpan = allSpans.find((s) => s.text === "dev")
    const prodSpan = allSpans.find((s) => s.text === "prod")
    expect(devSpan).toBeDefined()
    expect(prodSpan).toBeDefined()
    // theme.text foreground should be same for both
    expect(devSpan!.fg).toEqual(prodSpan!.fg)
  })

  it("renders colored dot when envColors has valid color key", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev", "prod"]}
          selectedEnvName={null}
          activeEnvName={undefined}
          envColors={{ dev: "success", prod: undefined }}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // "dev" should have a colored dot before it
    const devDot = allSpans.find((s) => s.text === "\u25cf ")
    expect(devDot).toBeDefined()
    // THEMES[0] is the default theme — use its success color
    expect(devDot!.fg.equals(RGBA.fromHex(THEMES[0].success))).toBe(true)
  })

  it("does not render colored dot when envColors is empty", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev", "prod"]}
          selectedEnvName={null}
          activeEnvName={undefined}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // without envColors, no bullet dot should appear before env names
    // (dirty dot is a separate test — this test has dirty=false)
    expect(frame).not.toContain("\u25cf")
  })

  it("renders muted dot for invalid color, no dot for undefined color", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvSidebar
          envNames={["dev", "staging", "prod"]}
          selectedEnvName={null}
          activeEnvName={undefined}
          envColors={{
            dev: "success",
            staging: undefined,
            prod: "nonexistent",
          }}
          dirty={false}
          onSelectEnv={() => {}}
          onCreate={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()
    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // "dev" has valid color "success" → dot with success color
    // "staging" has undefined color → no dot
    // "prod" has invalid "nonexistent" → ?? fallback to theme.textMuted → dot with muted
    const dots = allSpans.filter((s) => s.text === "\u25cf ")
    expect(dots).toHaveLength(2)
    // Verify each dot's color: success + textMuted
    const [dot1, dot2] = dots
    // one is success, one is textMuted (order depends on env names)
    const successRGBA = RGBA.fromHex(THEMES[0].success)
    const mutedRGBA = RGBA.fromHex(THEMES[0].textMuted)
    const dot1IsSuccess = dot1.fg.equals(successRGBA)
    const dot2IsSuccess = dot2.fg.equals(successRGBA)
    expect(
      (dot1IsSuccess && dot2.fg.equals(mutedRGBA)) ||
        (dot2IsSuccess && dot1.fg.equals(mutedRGBA)),
    ).toBe(true)
  })
})
