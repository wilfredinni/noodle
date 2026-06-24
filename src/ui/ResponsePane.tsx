export function ResponsePane() {
  return (
    <box
      style={{ border: true, flexGrow: 1, flexDirection: "column", padding: 1 }}
      title="Response"
    >
      <text fg="#888">(no response yet)</text>
    </box>
  )
}
