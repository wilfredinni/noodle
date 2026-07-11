import { LeftBar } from "../borders"
import { useTheme } from "../theme"

interface Props {
  title: string
  detail?: string | null
}

function truncateDetail(detail: string): string {
  const max = 180
  if (detail.length <= max) return detail
  return `${detail.slice(0, max - 3)}...`
}

export function ValidationNotice({ title, detail }: Props) {
  const theme = useTheme()
  const compactDetail = detail ? truncateDetail(detail) : null

  return (
    <box
      border={[...LeftBar.border]}
      customBorderChars={LeftBar.customBorderChars}
      borderColor={theme.error}
      style={{
        flexDirection: "column",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.backgroundElement,
      }}
    >
      <text fg={theme.error}>! {title}</text>
      {compactDetail && <text fg={theme.textMuted}> {compactDetail}</text>}
    </box>
  )
}
