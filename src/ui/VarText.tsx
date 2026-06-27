import { useMemo } from "react"
import { splitEnvVars } from "./envHighlight"
import { useTheme } from "./theme"
import type { Environment } from "../schema"

export function VarText({
  text,
  env,
  baseColor,
}: {
  text: string
  env: Environment | null
  baseColor?: string
}) {
  const theme = useTheme()
  const segments = useMemo(() => splitEnvVars(text, env), [text, env])
  const defaultColor = baseColor ?? theme.text

  return (
    <box style={{ flexDirection: "row", gap: 0 }}>
      {segments.map((seg, i) => (
        <text
          key={i}
          fg={
            seg.isVar
              ? seg.exists
                ? theme.primary
                : theme.error
              : defaultColor
          }
        >
          {seg.text}
        </text>
      ))}
    </box>
  )
}
