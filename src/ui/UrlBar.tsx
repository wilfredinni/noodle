export function UrlBar({
  url,
  setUrl,
  focused = false,
}: {
  url: string
  setUrl: (url: string) => void
  focused?: boolean
}) {
  return (
    <box
      style={{
        border: true,
        borderColor: focused ? "#61dafb" : undefined,
        flexDirection: "column",
        padding: 1,
      }}
      title={focused ? "▸ URL" : "URL"}
    >
      {focused ? (
        <input
          value={url}
          onInput={setUrl}
          backgroundColor="#222"
          focusedBackgroundColor="#333"
          textColor="#fff"
          cursorColor="#0f0"
          focused
        />
      ) : (
        <text fg="#fff">{url || "(no request selected)"}</text>
      )}
    </box>
  )
}
