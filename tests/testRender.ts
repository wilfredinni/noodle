import { afterEach } from "bun:test"
import type {
  TestRendererOptions,
  TestRendererSetup,
} from "@opentui/core/testing"
import { testRender as openTuiTestRender } from "@opentui/react/test-utils"
import { act, type ReactNode } from "react"

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}

export function createTestRender() {
  const renderers = new Set<TestRendererSetup["renderer"]>()

  afterEach(() => {
    act(() => {
      for (const renderer of renderers) {
        if (!renderer.isDestroyed) renderer.destroy()
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
      }
    })
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
    renderers.clear()
  })

  return async function testRender(
    node: ReactNode,
    options: TestRendererOptions,
  ): Promise<TestRendererSetup> {
    const setup = await openTuiTestRender(node, options)
    renderers.add(setup.renderer)
    return setup
  }
}
