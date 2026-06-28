import { useTheme } from "./theme"
import { FullBorder } from "./borders"

export function EnvHeaderPane({
  name,
  color,
  onNameChange,
  onColorChange,
  focused,
}: {
  name: string
  color: string | undefined
  onNameChange: (name: string) => void
  onColorChange: (color: string | undefined) => void
  focused: boolean
}) {
  const theme = useTheme()
  const colorValue =
    color !== undefined
      ? ((theme as unknown as Record<string, string>)[color] ?? theme.textMuted)
      : theme.textMuted

  return (
    <box
      style={{
        flexDirection: "row",
        gap: 1,
        padding: 1,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title="Environment"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      <input
        value={name}
        placeholder="Environment name"
        onInput={onNameChange}
        textColor={theme.text}
        cursorColor={theme.primary}
        style={{ flexGrow: 1 }}
      />
      <input
        value={color ?? ""}
        placeholder="Color"
        onInput={(v) => onColorChange(v || undefined)}
        textColor={colorValue}
        cursorColor={theme.primary}
        style={{ width: 18 }}
      />
    </box>
  )
}
