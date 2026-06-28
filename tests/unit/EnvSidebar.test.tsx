import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvSidebar } from "../../src/ui/EnvSidebar"

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
})
