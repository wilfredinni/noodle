export function RequestPane() {
  return (
    <box
      style={{ border: true, flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
      title="Request"
    >
      <text>GET  https://httpbin.org/get</text>
      <text fg="#888">[Send]</text>
    </box>
  )
}
