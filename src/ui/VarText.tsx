import { useMemo } from "react"
import { splitEnvVars } from "./variable-completion/envHighlight"
import { useTheme } from "./theme"
import type { Environment } from "../schema"
import type { BodyCompletion } from "./variable-completion/variableCompletion"

export function VarText({
  text,
  env,
  baseColor,
  body,
}: {
  text: string
  env: Environment | null
  baseColor?: string
  body?: BodyCompletion
}) {
  const theme = useTheme()
  const segments = useMemo(
    () => splitEnvVars(text, env, body),
    [text, env, body],
  )
  const defaultColor = baseColor ?? theme.text

  return (
    <box
      style={{
        flexDirection: "row",
        gap: 0,
        flexShrink: 1,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
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
          wrapMode="none"
          style={{ flexShrink: 0 }}
        >
          {seg.text}
        </text>
      ))}
    </box>
  )
}
