import { useEffect, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { t, fg, type ScrollBoxRenderable } from "@opentui/core"
import type { TimelineEntry } from "../../schema"
import { VALID_COLORS } from "../../env/constants"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { Tabs, type TabDef } from "../Tabs"
import { Badge } from "../Badge"
import { formatBody, formatHeaders, formatSize, statusColor } from "../format"
import { methodColor } from "../formatRequest"
import { JsonBodyViewer } from "../editor/JsonBodyViewer"
import {
  entryMethod,
  entryStatus,
  entryTiming,
  formatRequestUrl,
  buildDetailRequestHeaders,
  shortMethod,
  truncateUrl,
} from "../timeline/formatTimeline"

const TAB_DEFS: TabDef[] = [
  { id: "response", label: "Response" },
  { id: "request", label: "Request" },
]

function formatRequestBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export function TimelineDetailOverlay({
  visible,
  entry,
  onClose,
  envColors,
}: {
  visible: boolean
  entry: TimelineEntry | null
  onClose: () => void
  envColors?: Record<string, string | undefined>
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [activeTab, setActiveTab] = useState<"request" | "response">("response")
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (visible) setActiveTab("response")
  }, [visible])

  useEffect(() => {
    if (!visible || !entry) return
    return keymap.intercept(
      "key",
      (ctx) => {
        const key = ctx.event
        key.preventDefault()
        key.stopPropagation()

        if (key.name === "escape") onClose()
        else if (key.name === "left" || key.name === "right") {
          setActiveTab((prev) => (prev === "request" ? "response" : "request"))
        } else if (key.name === "up") scrollRef.current?.scrollBy(-1)
        else if (key.name === "down") scrollRef.current?.scrollBy(1)
        else if (key.name === "pageup")
          scrollRef.current?.scrollBy(-1, "viewport")
        else if (key.name === "pagedown")
          scrollRef.current?.scrollBy(1, "viewport")
      },
      { priority: 100 },
    )
  }, [visible, entry, keymap, onClose])

  if (!visible || !entry) return null

  const method = entryMethod(entry)
  const status = entryStatus(entry)
  const envColorKey = entry.envName ? envColors?.[entry.envName] : undefined
  const envBadgeBg =
    envColorKey && VALID_COLORS.has(envColorKey)
      ? ((theme as unknown as Record<string, string>)[envColorKey] ??
        theme.info)
      : theme.info

  const requestHeaders = buildDetailRequestHeaders(
    entry.request.auth,
    entry.request.headers,
  )
  const responseHeaders = entry.response ? formatHeaders(entry.response) : []
  const requestMaxKeyLen = requestHeaders.reduce(
    (max, header) => Math.max(max, header.key.length),
    0,
  )
  const responseMaxKeyLen = responseHeaders.reduce(
    (max, header) => Math.max(max, header.key.length),
    0,
  )
  const requestBody = entry.request.body
    ? formatRequestBody(entry.request.body)
    : ""
  const responseBody = entry.response?.body ? formatBody(entry.response) : ""

  return (
    <Overlay visible width={70} gap={1} padding={1}>
      <box
        style={{
          paddingLeft: 2,
          paddingRight: 2,
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
        }}
      >
        <Tabs
          tabs={TAB_DEFS}
          activeId={activeTab}
          rightChildren={<text fg={theme.textMuted}>esc</text>}
        >
          <scrollbox
            ref={scrollRef}
            scrollY
            maxHeight={24}
            scrollbarOptions={{ visible: false }}
            style={{ flexGrow: 1, minHeight: 0 }}
          >
            {activeTab === "request" && (
              <box style={{ flexDirection: "column", gap: 0, paddingTop: 1 }}>
                <text
                  wrapMode="char"
                  style={{ flexShrink: 1, minWidth: 10 }}
                  content={t`${fg(methodColor(method, theme))(shortMethod(method) + " ")}${fg(theme.primary)(formatRequestUrl(entry))}`}
                />
                <box
                  style={{
                    flexDirection: "row",
                    minWidth: 0,
                  }}
                >
                  <text
                    fg={theme.textMuted}
                    wrapMode="none"
                    style={{ flexShrink: 1, minWidth: 10 }}
                  >
                    {truncateUrl(entry.request.id, 60)}
                  </text>
                </box>
                <box
                  border={["bottom"]}
                  borderColor={theme.borderSubtle}
                  style={{ marginTop: 1 }}
                >
                  <text fg={theme.text}>Headers</text>
                </box>
                {requestHeaders.length === 0 ? (
                  <text fg={theme.textMuted}>(no headers)</text>
                ) : (
                  requestHeaders.map(({ key, value }, index) => (
                    <box
                      key={key}
                      border={
                        index < requestHeaders.length - 1 ? ["bottom"] : []
                      }
                      borderColor={theme.borderDimmest}
                      style={{ flexDirection: "row" }}
                    >
                      <text
                        fg={theme.textMuted}
                        style={{ minWidth: requestMaxKeyLen + 1 }}
                      >
                        {key.padEnd(requestMaxKeyLen)}
                      </text>
                      <text fg={theme.textMuted} wrapMode="none">
                        : {value}
                      </text>
                    </box>
                  ))
                )}
                <box
                  border={["bottom"]}
                  borderColor={theme.borderSubtle}
                  style={{ marginTop: 1 }}
                >
                  <text fg={theme.text}>Body</text>
                </box>
                {requestBody ? (
                  <JsonBodyViewer
                    key={requestBody}
                    body={requestBody}
                    theme={theme}
                    readOnly
                  />
                ) : (
                  <text fg={theme.textMuted}>(no body)</text>
                )}
              </box>
            )}
            {activeTab === "response" && (
              <box style={{ flexDirection: "column", gap: 0, paddingTop: 1 }}>
                {entry.error ? (
                  <box
                    border={["left", "right", "top", "bottom"]}
                    borderColor={theme.error}
                    style={{ padding: 1, marginBottom: 1 }}
                  >
                    <text fg={theme.error}>{entry.error.message}</text>
                  </box>
                ) : entry.response ? (
                  <box
                    style={{
                      flexDirection: "row",
                      marginBottom: 1,
                      minWidth: 0,
                    }}
                  >
                    <box style={{ flexDirection: "row", flexShrink: 0 }}>
                      <Badge
                        bg={statusColor(status!, theme)}
                        fg={theme.background}
                      >
                        {status}
                        {entry.response.statusText
                          ? ` ${entry.response.statusText}`
                          : ""}
                      </Badge>
                      {entry.envName && (
                        <box style={{ marginLeft: 1 }}>
                          <Badge bg={envBadgeBg} fg={theme.background}>
                            {entry.envName}
                          </Badge>
                        </box>
                      )}
                    </box>
                    <box style={{ flexGrow: 1 }} />
                    <text fg={theme.textMuted} wrapMode="none">
                      {formatSize(entry.response.size)} in {entryTiming(entry)}
                    </text>
                  </box>
                ) : (
                  <text fg={theme.textMuted}>No response</text>
                )}
                <box border={["bottom"]} borderColor={theme.borderSubtle}>
                  <text fg={theme.text}>Headers</text>
                </box>
                {responseHeaders.length === 0 ? (
                  <text fg={theme.textMuted}>(no headers)</text>
                ) : (
                  responseHeaders.map(({ key, value }, index) => (
                    <box
                      key={key}
                      border={
                        index < responseHeaders.length - 1 ? ["bottom"] : []
                      }
                      borderColor={theme.borderDimmest}
                      style={{ flexDirection: "row" }}
                    >
                      <text
                        fg={theme.textMuted}
                        style={{ minWidth: responseMaxKeyLen + 1 }}
                      >
                        {key.padEnd(responseMaxKeyLen)}
                      </text>
                      <text fg={theme.textMuted} wrapMode="none">
                        : {value}
                      </text>
                    </box>
                  ))
                )}
                <box
                  border={["bottom"]}
                  borderColor={theme.borderSubtle}
                  style={{ marginTop: 1 }}
                >
                  <text fg={theme.text}>Body</text>
                </box>
                {entry.response ? (
                  responseBody ? (
                    <JsonBodyViewer
                      key={responseBody}
                      body={responseBody}
                      theme={theme}
                      readOnly
                    />
                  ) : (
                    <text fg={theme.textMuted}>(empty body)</text>
                  )
                ) : (
                  <text fg={theme.textMuted}>No response</text>
                )}
              </box>
            )}
          </scrollbox>
        </Tabs>
      </box>
    </Overlay>
  )
}
