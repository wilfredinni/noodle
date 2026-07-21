import type { Theme } from "./theme"

export interface HeaderEntry {
  key: string
  value: string
}

export interface HeaderTableProps {
  entries: HeaderEntry[]
  theme: Theme
  emptyText?: string
}

export function HeaderTable({
  entries,
  theme,
  emptyText = "(no headers)",
}: HeaderTableProps) {
  const panelNum = parseInt(theme.backgroundPanel.slice(1), 16)
  const elemNum = parseInt(theme.backgroundElement.slice(1), 16)
  const stripeR = Math.round(
    (((panelNum >> 16) & 0xff) + ((elemNum >> 16) & 0xff)) / 2,
  )
  const stripeG = Math.round(
    (((panelNum >> 8) & 0xff) + ((elemNum >> 8) & 0xff)) / 2,
  )
  const stripeB = Math.round(((panelNum & 0xff) + (elemNum & 0xff)) / 2)
  const stripeBg = `#${stripeR.toString(16).padStart(2, "0")}${stripeG.toString(16).padStart(2, "0")}${stripeB.toString(16).padStart(2, "0")}`

  if (entries.length === 0) {
    return <text fg={theme.textMuted}>{emptyText}</text>
  }

  const maxKeyLen =
    entries.length > 0 ? Math.max(...entries.map((e) => e.key.length)) : 0
  const keyWidth = maxKeyLen + 2

  return (
    <box style={{ flexDirection: "column" }}>
      {entries.map((entry, i) => (
        <box
          key={`${entry.key}-${i}`}
          style={{
            flexDirection: "row",
            gap: 0,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: i % 2 !== 0 ? stripeBg : undefined,
          }}
        >
          <text
            fg={theme.text}
            wrapMode="none"
            style={{ minWidth: keyWidth, flexShrink: 0 }}
          >
            {entry.key.padEnd(keyWidth)}
          </text>
          <text
            fg={theme.textMuted}
            wrapMode="none"
            style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
          >
            {entry.value}
          </text>
        </box>
      ))}
    </box>
  )
}
