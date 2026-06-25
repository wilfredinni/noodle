import { TextAttributes } from "@opentui/core"

export function Brand() {
  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingX: 1,
      }}
    >
      <text fg="#61dafb" attributes={TextAttributes.BOLD}>noodle</text>
    </box>
  )
}
