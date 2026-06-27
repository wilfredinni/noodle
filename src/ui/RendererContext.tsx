import { createContext, useContext } from "react"
import type { CliRenderer } from "@opentui/core"

const RendererCtx = createContext<CliRenderer | null>(null)

export function RendererProvider({
  renderer,
  children,
}: {
  renderer: CliRenderer
  children: React.ReactNode
}) {
  return <RendererCtx.Provider value={renderer}>{children}</RendererCtx.Provider>
}

export function useRenderer(): CliRenderer {
  const r = useContext(RendererCtx)
  if (!r) throw new Error("useRenderer: missing <RendererProvider>")
  return r
}
