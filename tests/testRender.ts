import { scheduler } from "node:timers/promises"
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

  afterEach(async () => {
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    try {
      await act(() => {
        for (const renderer of renderers) {
          actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
          if (!renderer.isDestroyed) renderer.destroy()
          actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
        }
      })
    } finally {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      renderers.clear()
    }
  })

  return async function testRender(
    node: ReactNode,
    options: TestRendererOptions,
  ): Promise<TestRendererSetup> {
    const setup = await openTuiTestRender(node, options)
    const destroy = setup.renderer.destroy.bind(setup.renderer)
    setup.renderer.destroy = () => {
      destroy()
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    }
    renderers.add(setup.renderer)
    return setup
  }
}

// Hook state can arrive after native rendering becomes idle. Bound the operation
// by elapsed time rather than native frames, and stop before test teardown.
export async function waitForHookState(
  render: TestRendererSetup,
  predicate: () => boolean,
  timeoutMs = 4000,
) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (render.renderer.isDestroyed)
      throw new Error("Hook renderer was destroyed while waiting for state")
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for published hook state")
    await act(async () => {
      await scheduler.yield()
      await render.renderOnce()
    })
  }
}
