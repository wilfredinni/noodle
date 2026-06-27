import type { ReactNode } from "react"

export function Badge({
  bg,
  fg,
  children,
}: {
  bg: string
  fg: string
  children: ReactNode
}) {
  return (
    <box
      style={{
        backgroundColor: bg,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text fg={fg}>{children}</text>
    </box>
  )
}
