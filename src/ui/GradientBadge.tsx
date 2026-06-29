import { interpolateGradient } from "./gradient"

export function GradientBadge({
  colors,
  fg,
  children,
}: {
  colors: string[]
  fg: string
  children: string
}) {
  const chars = [...children]
  const n = chars.length

  return (
    <box>
      <text>
        <span bg={colors[0]} fg={fg}>
          {" "}
        </span>
        {chars.map((c, i) => {
          const t = n > 1 ? i / (n - 1) : 0
          const bg = interpolateGradient(colors, t)
          return (
            <span key={i} bg={bg} fg={fg}>
              {c}
            </span>
          )
        })}
        <span bg={colors[colors.length - 1]} fg={fg}>
          {" "}
        </span>
      </text>
    </box>
  )
}
