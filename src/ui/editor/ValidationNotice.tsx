import { LeftBar } from "../borders"
import { useTheme } from "../theme"
import type { YamlValidationNotice } from "./yamlValidation"

interface Props {
  notice?: YamlValidationNotice
  title?: string
  detail?: string | null
}

function truncateText(detail: string): string {
  const max = 180
  if (detail.length <= max) return detail
  return `${detail.slice(0, max - 3)}...`
}

export function ValidationNotice({ notice, title, detail }: Props) {
  const theme = useTheme()
  const resolvedTitle = notice?.title ?? title
  const resolvedDetail = notice?.detail ?? detail
  const compactTitle = resolvedTitle ? truncateText(resolvedTitle) : null
  const compactDetail = resolvedDetail ? truncateText(resolvedDetail) : null

  return (
    <box
      border={[...LeftBar.border]}
      customBorderChars={LeftBar.customBorderChars}
      borderColor={theme.error}
      style={{
        flexDirection: "column",
        flexShrink: 0,
        minWidth: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.backgroundElement,
      }}
    >
      {compactTitle && (
        <text
          fg={theme.error}
          wrapMode="none"
          truncate
          style={{ minWidth: 0, width: "100%" }}
        >
          ! {compactTitle}
        </text>
      )}
      {compactDetail && (
        <text
          fg={compactTitle ? theme.textMuted : theme.error}
          wrapMode="none"
          truncate
          style={{ minWidth: 0, width: "100%" }}
        >
          {compactTitle ? ` ${compactDetail}` : compactDetail}
        </text>
      )}
    </box>
  )
}
