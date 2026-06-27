import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import type { CliRenderer } from "@opentui/core"

const RendererContext = createContext<CliRenderer | null>(null)

export function RendererProvider({
  renderer,
  children,
}: {
  renderer: CliRenderer
  children: ReactNode
}) {
  return (
    <RendererContext.Provider value={renderer}>
      {children}
    </RendererContext.Provider>
  )
}

export function useRenderer(): CliRenderer {
  const r = useContext(RendererContext)
  if (!r) throw new Error("useRenderer: missing <RendererProvider>")
  return r
}
